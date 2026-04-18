import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { settingsSchema, onboardingSchema, exposureProviderSchema } from '../../shared/schemas.js';
import { getDatabase } from '../db/index.js';
import { settings, exposureProviders } from '../db/schema.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { ExposureProviderRegistry } from '../services/exposure/provider-registry.js';

export async function settingsRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('preHandler', authenticate);

  // GET / - Get settings
  app.get('/', async (request) => {
    const db = getDatabase();
    const { id: userId } = request.user as { id: string; username: string };

    const [userSettings] = await db.select().from(settings).where(eq(settings.userId, userId));

    const providers = await db
      .select()
      .from(exposureProviders)
      .where(eq(exposureProviders.userId, userId));

    return {
      ...userSettings,
      exposureProviders: providers,
    };
  });

  // PUT / - Update settings
  app.put('/', async (request, reply) => {
    const parsed = settingsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    const db = getDatabase();
    const { id: userId } = request.user as { id: string; username: string };

    const [updated] = await db
      .update(settings)
      .set({
        ...parsed.data,
        updatedAt: Date.now(),
      })
      .where(eq(settings.userId, userId))
      .returning();

    return updated;
  });

  // POST /onboarding - Complete onboarding
  app.post('/onboarding', async (request, reply) => {
    const parsed = onboardingSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    const db = getDatabase();
    const { id: userId } = request.user as { id: string; username: string };

    // Create exposure providers from request
    const { exposureProviders: providers } = parsed.data;
    for (const provider of providers) {
      await db.insert(exposureProviders).values({
        userId,
        providerType: provider.providerType,
        name: provider.name,
        enabled: provider.enabled,
        configuration: JSON.stringify(provider.configuration),
      });
    }

    // Set onboarding_completed to true
    await db
      .update(settings)
      .set({
        onboardingCompleted: true,
        updatedAt: Date.now(),
      })
      .where(eq(settings.userId, userId));

    return { success: true };
  });

  // GET /exposure-providers - List all exposure providers
  app.get('/exposure-providers', async (request) => {
    const db = getDatabase();
    const { id: userId } = request.user as { id: string; username: string };

    const providers = await db
      .select()
      .from(exposureProviders)
      .where(eq(exposureProviders.userId, userId));

    return providers.map((p) => ({
      ...p,
      configuration: JSON.parse(p.configuration as string),
    }));
  });

  // POST /exposure-providers - Create a new exposure provider
  app.post('/exposure-providers', async (request, reply) => {
    const parsed = exposureProviderSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    const db = getDatabase();
    const { id: userId } = request.user as { id: string; username: string };

    const [created] = await db
      .insert(exposureProviders)
      .values({
        userId,
        providerType: parsed.data.providerType,
        name: parsed.data.name,
        enabled: parsed.data.enabled,
        configuration: JSON.stringify(parsed.data.configuration),
      })
      .returning();

    return {
      ...created,
      configuration: JSON.parse(created.configuration as string),
    };
  });

  // PUT /exposure-providers/:id - Update an exposure provider
  app.put('/exposure-providers/:id', async (request, reply) => {
    const parsed = exposureProviderSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    const db = getDatabase();
    const { id: userId } = request.user as { id: string; username: string };
    const { id } = request.params as { id: string };

    // Verify ownership
    const [existing] = await db
      .select()
      .from(exposureProviders)
      .where(eq(exposureProviders.id, id));

    if (!existing || existing.userId !== userId) {
      return reply.code(404).send({ error: 'Provider not found' });
    }

    const [updated] = await db
      .update(exposureProviders)
      .set({
        providerType: parsed.data.providerType,
        name: parsed.data.name,
        enabled: parsed.data.enabled,
        configuration: JSON.stringify(parsed.data.configuration),
        updatedAt: Date.now(),
      })
      .where(eq(exposureProviders.id, id))
      .returning();

    return {
      ...updated,
      configuration: JSON.parse(updated.configuration as string),
    };
  });

  // DELETE /exposure-providers/:id - Delete an exposure provider
  app.delete('/exposure-providers/:id', async (request, reply) => {
    const db = getDatabase();
    const { id: userId } = request.user as { id: string; username: string };
    const { id } = request.params as { id: string };

    // Verify ownership
    const [existing] = await db
      .select()
      .from(exposureProviders)
      .where(eq(exposureProviders.id, id));

    if (!existing || existing.userId !== userId) {
      return reply.code(404).send({ error: 'Provider not found' });
    }

    await db.delete(exposureProviders).where(eq(exposureProviders.id, id));

    return { success: true };
  });

  // POST /exposure-providers/check-setup - Validate provider configuration
  app.post('/exposure-providers/check-setup', async (request, reply) => {
    const { providerType, configuration } = request.body as {
      providerType: string;
      configuration: Record<string, any>;
    };

    if (!providerType || typeof providerType !== 'string') {
      return reply.code(400).send({ error: 'providerType is required' });
    }
    if (!configuration || typeof configuration !== 'object') {
      return reply.code(400).send({ error: 'configuration is required' });
    }

    const registry = (app as any).providerRegistry as ExposureProviderRegistry;
    const provider = registry.get(providerType);

    if (!provider) {
      return reply.code(400).send({ error: `Unknown provider type: ${providerType}` });
    }

    if (!provider.checkSetup) {
      return { allPassed: true, checks: [] };
    }

    await provider.initialize(configuration);
    return provider.checkSetup();
  });

  // GET /exposure-providers/:id/domains - List available domains for a provider
  app.get('/exposure-providers/:id/domains', async (request, reply) => {
    const db = getDatabase();
    const { id: userId } = request.user as { id: string; username: string };
    const { id } = request.params as { id: string };

    const [providerConfig] = await db
      .select()
      .from(exposureProviders)
      .where(eq(exposureProviders.id, id));

    if (!providerConfig || providerConfig.userId !== userId) {
      return reply.code(404).send({ error: 'Provider not found' });
    }

    const registry = (app as any).providerRegistry as ExposureProviderRegistry;
    const provider = registry.get(providerConfig.providerType);
    if (!provider || !provider.listDomains) {
      return [];
    }

    const config =
      typeof providerConfig.configuration === 'string'
        ? JSON.parse(providerConfig.configuration)
        : providerConfig.configuration;

    await provider.initialize(config);
    return provider.listDomains();
  });
}

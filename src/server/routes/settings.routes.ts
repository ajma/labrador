import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { settingsSchema, onboardingSchema, exposureProviderSchema } from '../../shared/schemas.js';
import { getDatabase } from '../db/index.js';
import { settings, exposureProviders, projects } from '../db/schema.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { ExposureProviderRegistry } from '../services/exposure/provider-registry.js';

export async function settingsRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('preHandler', authenticate);

  const backupProjectSchema = z.object({
    name: z.string().min(1),
    logoUrl: z.string().nullable().optional(),
    domainName: z.string().nullable().optional(),
    composeContent: z.string(),
    exposureEnabled: z.boolean().optional().default(false),
    exposureProviderName: z.string().nullable().optional(),
    exposureConfig: z.record(z.any()).optional().default({}),
    isInfrastructure: z.boolean().optional().default(false),
  });

  const backupSchema = z.object({
    version: z.literal(1),
    exportedAt: z.string(),
    settings: z.object({
      defaultExposureProviderName: z.string().nullable().optional(),
    }),
    providers: z.array(z.object({
      providerType: z.string(),
      name: z.string(),
      enabled: z.boolean().optional().default(true),
      configuration: z.record(z.any()),
    })),
    projects: z.array(backupProjectSchema).optional().default([]),
  });

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

  // GET /export - Download full user data as JSON backup
  app.get('/export', async (request, reply) => {
    const db = getDatabase();
    const { id: userId } = request.user as { id: string; username: string };

    const [userSettings] = await db.select().from(settings).where(eq(settings.userId, userId));
    const providerRows = await db.select().from(exposureProviders).where(eq(exposureProviders.userId, userId));
    const projectRows = await db.select().from(projects).where(eq(projects.userId, userId));

    const providerIdToName = new Map(providerRows.map((p) => [p.id, p.name]));

    const defaultProviderName = userSettings?.defaultExposureProviderId
      ? (providerIdToName.get(userSettings.defaultExposureProviderId) ?? null)
      : null;

    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: { defaultExposureProviderName: defaultProviderName },
      providers: providerRows.map((p) => ({
        providerType: p.providerType,
        name: p.name,
        enabled: p.enabled,
        configuration: typeof p.configuration === 'string' ? JSON.parse(p.configuration) : p.configuration,
      })),
      projects: projectRows.map((p) => ({
        name: p.name,
        logoUrl: p.logoUrl,
        domainName: p.domainName,
        composeContent: p.composeContent,
        exposureEnabled: p.exposureEnabled,
        exposureProviderName: p.exposureProviderId ? (providerIdToName.get(p.exposureProviderId) ?? null) : null,
        exposureConfig: p.exposureConfig ? JSON.parse(p.exposureConfig) : {},
        isInfrastructure: p.isInfrastructure,
      })),
    };

    const date = new Date().toISOString().slice(0, 10);
    reply.header('Content-Disposition', `attachment; filename="labrador-backup-${date}.json"`);
    reply.header('Content-Type', 'application/json');
    return backup;
  });

  // POST /import - Restore all user data from backup (full replace)
  app.post('/import', async (request, reply) => {
    const parsed = backupSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid backup file', details: parsed.error.flatten() });
    }

    const db = getDatabase();
    const { id: userId } = request.user as { id: string; username: string };
    const { settings: backupSettings, providers: backupProviders, projects: backupProjects } = parsed.data;

    // Delete existing data (projects first — they reference providers)
    await db.delete(projects).where(eq(projects.userId, userId));
    await db.delete(exposureProviders).where(eq(exposureProviders.userId, userId));

    // Insert providers, collecting name → new ID map
    const nameToId = new Map<string, string>();
    for (const provider of backupProviders) {
      const [created] = await db
        .insert(exposureProviders)
        .values({
          userId,
          providerType: provider.providerType,
          name: provider.name,
          enabled: provider.enabled,
          configuration: JSON.stringify(provider.configuration),
        })
        .returning();
      nameToId.set(provider.name, created.id);
    }

    // Slug helper — same logic as project.service.ts
    function slugify(name: string): string {
      return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }

    // Insert projects, remapping exposureProviderName → new ID
    for (const project of backupProjects) {
      const exposureProviderId = project.exposureProviderName
        ? (nameToId.get(project.exposureProviderName) ?? null)
        : null;

      await db.insert(projects).values({
        userId,
        name: project.name,
        slug: `${slugify(project.name)}-${Math.random().toString(36).slice(2, 8)}`,
        logoUrl: project.logoUrl ?? null,
        domainName: project.domainName ?? null,
        composeContent: project.composeContent,
        exposureEnabled: project.exposureEnabled,
        exposureProviderId,
        exposureConfig: JSON.stringify(project.exposureConfig ?? {}),
        isInfrastructure: project.isInfrastructure,
      });
    }

    // Resolve default provider name → new ID and update settings
    const defaultProviderId = backupSettings.defaultExposureProviderName
      ? (nameToId.get(backupSettings.defaultExposureProviderName) ?? null)
      : null;

    await db
      .update(settings)
      .set({ defaultExposureProviderId: defaultProviderId, updatedAt: Date.now() })
      .where(eq(settings.userId, userId));

    return { success: true };
  });
}

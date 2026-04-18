import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { settingsSchema, onboardingSchema } from '../../shared/schemas.js';
import { getDatabase } from '../db/index.js';
import { settings, exposureProviders } from '../db/schema.js';
import { authenticate } from '../middleware/auth.middleware.js';

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
}

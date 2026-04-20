import bcrypt from 'bcrypt';
import type { AppDatabase } from '../../src/server/db/index.js';
import {
  users,
  settings,
  exposureProviders,
  projects,
  containerStats,
  containerUpdates,
} from '../../src/server/db/schema.js';

export const SEED_USERNAME = 'admin';
export const SEED_PASSWORD = 'password123';

export async function seedDatabase(db: AppDatabase) {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 4);
  const [user] = await db.insert(users).values({ username: SEED_USERNAME, passwordHash }).returning();
  await db.insert(settings).values({ userId: user.id, onboardingCompleted: true });
}

export async function clearDatabase(db: AppDatabase) {
  await db.delete(containerStats);
  await db.delete(containerUpdates);
  await db.delete(projects);
  await db.delete(exposureProviders);
  await db.delete(settings);
  await db.delete(users);
}

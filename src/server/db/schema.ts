import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import crypto from 'crypto';

export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: integer('created_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
});

export const settings = sqliteTable('settings', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id),
  onboardingCompleted: integer('onboarding_completed', { mode: 'boolean' }).notNull().default(false),
  defaultExposureProviderId: text('default_exposure_provider_id'),
  createdAt: integer('created_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
});

export const exposureProviders = sqliteTable('exposure_providers', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id),
  providerType: text('provider_type').notNull(),
  name: text('name').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  configuration: text('configuration').notNull().default('{}'),
  createdAt: integer('created_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
});

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logoUrl: text('logo_url'),
  domainName: text('domain_name'),
  composeContent: text('compose_content').notNull().default(''),
  exposureEnabled: integer('exposure_enabled', { mode: 'boolean' }).notNull().default(false),
  exposureProviderId: text('exposure_provider_id'),
  exposureConfig: text('exposure_config').default('{}'),
  isInfrastructure: integer('is_infrastructure', { mode: 'boolean' }).notNull().default(false),
  status: text('status').notNull().default('stopped'),
  createdAt: integer('created_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
  deployedAt: integer('deployed_at', { mode: 'number' }),
});

export const containerStats = sqliteTable('container_stats', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id').notNull().references(() => projects.id),
  containerName: text('container_name').notNull(),
  cpuUsage: real('cpu_usage').notNull().default(0),
  memoryUsage: integer('memory_usage', { mode: 'number' }).notNull().default(0),
  networkRx: integer('network_rx', { mode: 'number' }).notNull().default(0),
  networkTx: integer('network_tx', { mode: 'number' }).notNull().default(0),
  uptimeStatus: text('uptime_status').notNull().default('down'),
  recordedAt: integer('recorded_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
});

export const containerUpdates = sqliteTable('container_updates', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id').notNull().references(() => projects.id),
  containerName: text('container_name').notNull(),
  currentImage: text('current_image').notNull(),
  latestImage: text('latest_image').notNull(),
  updateAvailable: integer('update_available', { mode: 'boolean' }).notNull().default(false),
  checkedAt: integer('checked_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
});

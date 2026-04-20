import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema.js';
import fs from 'fs';
import path from 'path';

let db: ReturnType<typeof drizzle>;

export function initDatabase(url?: string) {
  const dbUrl = url ?? `file:${process.env.DATABASE_PATH ?? './data/homelabman.db'}`;

  if (dbUrl.startsWith('file:') && !dbUrl.includes(':memory:')) {
    const dbPath = dbUrl.replace(/^file:/, '');
    const dir = path.dirname(path.resolve(dbPath));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const client = createClient({ url: dbUrl });
  db = drizzle(client, { schema });
  return db;
}

export function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export type AppDatabase = ReturnType<typeof initDatabase>;

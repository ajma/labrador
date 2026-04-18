import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema.js';
import fs from 'fs';
import path from 'path';

let db: ReturnType<typeof drizzle>;

export function initDatabase() {
  const dbPath = process.env.DATABASE_PATH || './data/homelabman.db';

  // Ensure data directory exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('foreign_keys = ON');

  db = drizzle(sqlite, { schema });
  return db;
}

export function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export type AppDatabase = ReturnType<typeof initDatabase>;

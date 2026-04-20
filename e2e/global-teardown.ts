import { rm } from 'fs/promises';
import { getServer } from './server-singleton.js';

export default async function globalTeardown() {
  const { server, dbPath } = getServer();
  if (server) await server.close();
  if (dbPath) await rm(dbPath, { force: true });
}

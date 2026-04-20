import type { FastifyInstance } from 'fastify';

let server: FastifyInstance | null = null;
let dbPath: string | null = null;

export function setServer(app: FastifyInstance, path: string) {
  server = app;
  dbPath = path;
}

export function getServer() {
  return { server, dbPath };
}

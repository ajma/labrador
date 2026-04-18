import { FastifyRequest, FastifyReply } from 'fastify';

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify({ onlyCookie: true });
  } catch {
    reply.code(401).send({ error: 'Unauthorized' });
  }
}

import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  request.log.error(error);

  const statusCode = error.statusCode || 500;
  reply.code(statusCode).send({
    error: statusCode >= 500 ? 'Internal Server Error' : error.message,
  });
}

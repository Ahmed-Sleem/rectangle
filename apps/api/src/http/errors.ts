/**
 * HTTP error mapping returns safe, stable problem responses for domain failures
 * and hides unexpected infrastructure details from clients.
 */
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { isDomainError } from "../domain/errors.js";

const statusByCode = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  CONFLICT: 409,
  NOT_FOUND: 404,
} as const;

export async function errorHandler(error: FastifyError | Error, _request: FastifyRequest, reply: FastifyReply) {
  if (isDomainError(error)) {
    const statusCode = statusByCode[error.code];
    return reply.status(statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    });
  }

  return reply.status(500).send({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected server error occurred.",
    },
  });
}

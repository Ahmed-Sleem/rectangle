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
  CONFIGURATION_REQUIRED: 503,
  RATE_LIMITED: 429,
} as const;

export async function errorHandler(error: FastifyError | Error, _request: FastifyRequest, reply: FastifyReply) {
  if (isDomainError(error)) {
    const statusCode = statusByCode[error.code];

    // Tell a throttled caller when to come back, so a well-behaved client can
    // wait rather than retry into the same wall.
    if (error.code === "RATE_LIMITED") {
      const retryAfter = (error.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds;
      if (typeof retryAfter === "number") reply.header("retry-after", String(retryAfter));
    }

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

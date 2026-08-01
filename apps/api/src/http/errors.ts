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

export async function errorHandler(error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) {
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

  /*
   * Faults the framework rejected before any handler ran — a body over the
   * limit, malformed JSON, an unsupported content type — arrive here carrying
   * their own 4xx status. Collapsing them into 500 told the caller the server
   * had broken when the request had, and buried genuine client errors in the
   * server-error rate that alerting watches.
   *
   * Only the status and the machine code are echoed. Fastify's message can
   * describe internals, so a fixed sentence is sent instead.
   */
  const frameworkStatus = (error as FastifyError).statusCode;
  if (typeof frameworkStatus === "number" && frameworkStatus >= 400 && frameworkStatus < 500) {
    return reply.status(frameworkStatus).send({
      error: {
        code: (error as FastifyError).code ?? "BAD_REQUEST",
        message: "The request could not be accepted.",
      },
    });
  }

  /*
   * Logged before it is answered, because until now it was not logged at all.
   *
   * The caller is deliberately told nothing — an unexpected fault is the one
   * case where the message could carry a table name, a query or a stack — but
   * the operator has to be told everything, and this handler was discarding
   * the error object entirely. A 500 in production left no trace anywhere: the
   * request log recorded the status and nothing about the cause, so the only
   * way to learn why was to reproduce it. Found by an end-to-end test that hit
   * a 500 and could not say why.
   */
  request.log.error(
    { err: error, method: request.method, url: request.url },
    "unhandled error while serving a request",
  );

  return reply.status(500).send({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected server error occurred.",
    },
  });
}

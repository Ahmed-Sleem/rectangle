/**
 * Domain errors are stable application failures that HTTP adapters can map to
 * safe responses without leaking database or infrastructure details.
 */
export type DomainErrorCode =
  | "VALIDATION_FAILED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "NOT_FOUND"
  | "CONFIGURATION_REQUIRED"
  /*
   * A service Rectangle depends on but does not run. Distinct from
   * CONFIGURATION_REQUIRED, which means somebody here has something to fix,
   * and from the 5xx family, which would claim the fault is ours.
   */
  | "UPSTREAM_UNAVAILABLE"
  | "UPSTREAM_TIMEOUT"
  /*
   * The conversation outgrew what the model can read at once. Not an upstream
   * failure: the provider is healthy and answered correctly, and the person has
   * a real remedy — carry on in a new thread — which the other codes do not
   * imply and the client must be able to distinguish in order to offer it.
   */
  | "CONTEXT_TOO_LONG"
  /*
   * The model generated arguments its own provider would not accept. Distinct
   * from an unavailable provider: the connection is healthy and the turn is
   * retryable, so the loop feeds the failure back rather than giving up.
   */
  | "UPSTREAM_TOOL_CALL_REJECTED"
  | "RATE_LIMITED";

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details: unknown;

  constructor(code: DomainErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.details = details;
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}

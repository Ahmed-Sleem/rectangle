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

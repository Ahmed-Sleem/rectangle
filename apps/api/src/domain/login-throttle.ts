/**
 * Login attempt throttling.
 *
 * Without this a password is only as strong as the attacker's patience: the
 * login route is public and every failure is cheap. Failures are already
 * audited, but recording an attack is not the same as stopping one.
 *
 * Attempts are counted per identity *and* per source address. Counting only by
 * identity lets one attacker spray many accounts from one machine; counting
 * only by address lets a distributed attempt through. Either limit trips the
 * lockout.
 *
 * The state is intentionally an interface: this in-memory implementation is
 * correct for a single instance, and a Redis-backed one can replace it when
 * Rectangle runs more than one.
 */

export interface ThrottleDecision {
  allowed: boolean;
  /** Seconds the caller must wait. Only meaningful when `allowed` is false. */
  retryAfterSeconds: number;
}

export interface LoginThrottle {
  check(keys: readonly string[]): ThrottleDecision;
  recordFailure(keys: readonly string[]): void;
  recordSuccess(keys: readonly string[]): void;
}

export interface LoginThrottleOptions {
  /** Failures tolerated inside the window before the key is locked. */
  maxAttempts?: number;
  /** How long failures are remembered. */
  windowSeconds?: number;
  /** How long a locked key stays locked. */
  lockoutSeconds?: number;
  /** Injectable clock so the behaviour can be tested without waiting. */
  now?: () => number;
}

interface AttemptState {
  failures: number;
  firstFailureAt: number;
  lockedUntil: number;
}

export class InMemoryLoginThrottle implements LoginThrottle {
  private readonly attempts = new Map<string, AttemptState>();
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly lockoutMs: number;
  private readonly now: () => number;

  constructor(options: LoginThrottleOptions = {}) {
    // Ten failures in fifteen minutes is far beyond normal mistyping while
    // still being a hard ceiling for guessing.
    this.maxAttempts = options.maxAttempts ?? 10;
    this.windowMs = (options.windowSeconds ?? 15 * 60) * 1000;
    this.lockoutMs = (options.lockoutSeconds ?? 15 * 60) * 1000;
    this.now = options.now ?? Date.now;
  }

  check(keys: readonly string[]): ThrottleDecision {
    const now = this.now();
    let longestWait = 0;

    for (const key of keys) {
      const state = this.attempts.get(key);
      if (state && state.lockedUntil > now) {
        longestWait = Math.max(longestWait, state.lockedUntil - now);
      }
    }

    if (longestWait > 0) {
      return { allowed: false, retryAfterSeconds: Math.ceil(longestWait / 1000) };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }

  recordFailure(keys: readonly string[]): void {
    const now = this.now();

    for (const key of keys) {
      const existing = this.attempts.get(key);

      // A window that has elapsed starts over, so occasional mistakes spread
      // across a day never accumulate into a lockout.
      if (!existing || now - existing.firstFailureAt > this.windowMs) {
        this.attempts.set(key, { failures: 1, firstFailureAt: now, lockedUntil: 0 });
        continue;
      }

      existing.failures += 1;
      if (existing.failures >= this.maxAttempts) {
        existing.lockedUntil = now + this.lockoutMs;
        existing.failures = 0;
        existing.firstFailureAt = now;
      }
    }

    this.prune(now);
  }

  /** A correct password clears that identity's history; it was the real user. */
  recordSuccess(keys: readonly string[]): void {
    for (const key of keys) {
      this.attempts.delete(key);
    }
  }

  /** Keeps the map from growing without bound on a long-running process. */
  private prune(now: number): void {
    if (this.attempts.size < 10_000) return;
    for (const [key, state] of this.attempts) {
      const expired = now - state.firstFailureAt > this.windowMs && state.lockedUntil <= now;
      if (expired) this.attempts.delete(key);
    }
  }
}

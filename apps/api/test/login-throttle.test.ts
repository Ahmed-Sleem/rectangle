/** Tests that repeated failed sign-ins are actually stopped, not just logged. */
import { describe, expect, it } from "vitest";
import { InMemoryLoginThrottle } from "../src/domain/login-throttle.js";

const identity = ["identity:acme:someone@example.com"];

function throttleAt(clock: { now: number }) {
  return new InMemoryLoginThrottle({
    maxAttempts: 3,
    windowSeconds: 60,
    lockoutSeconds: 120,
    now: () => clock.now,
  });
}

describe("InMemoryLoginThrottle", () => {
  it("allows attempts until the limit is reached", () => {
    const clock = { now: 0 };
    const throttle = throttleAt(clock);

    throttle.recordFailure(identity);
    throttle.recordFailure(identity);

    expect(throttle.check(identity).allowed).toBe(true);
  });

  it("locks the identity once the limit is reached", () => {
    const clock = { now: 0 };
    const throttle = throttleAt(clock);

    for (let attempt = 0; attempt < 3; attempt += 1) throttle.recordFailure(identity);

    const decision = throttle.check(identity);
    expect(decision.allowed).toBe(false);
    expect(decision.retryAfterSeconds).toBe(120);
  });

  it("releases the lock once it expires", () => {
    const clock = { now: 0 };
    const throttle = throttleAt(clock);
    for (let attempt = 0; attempt < 3; attempt += 1) throttle.recordFailure(identity);

    clock.now += 120_000;

    expect(throttle.check(identity).allowed).toBe(true);
  });

  it("forgets failures spread beyond the window instead of accumulating them", () => {
    const clock = { now: 0 };
    const throttle = throttleAt(clock);

    throttle.recordFailure(identity);
    throttle.recordFailure(identity);
    // The window elapses, so these two must not count toward the next batch.
    clock.now += 61_000;
    throttle.recordFailure(identity);
    throttle.recordFailure(identity);

    expect(throttle.check(identity).allowed).toBe(true);
  });

  it("clears history when the real user finally signs in", () => {
    const clock = { now: 0 };
    const throttle = throttleAt(clock);
    throttle.recordFailure(identity);
    throttle.recordFailure(identity);

    throttle.recordSuccess(identity);
    throttle.recordFailure(identity);

    expect(throttle.check(identity).allowed).toBe(true);
  });

  it("locks a source address spraying many different accounts", () => {
    const clock = { now: 0 };
    const throttle = throttleAt(clock);
    const address = "address:203.0.113.9";

    // Three different victims, one attacker: the identity counters never trip,
    // but the address counter must.
    throttle.recordFailure(["identity:acme:a@example.com", address]);
    throttle.recordFailure(["identity:acme:b@example.com", address]);
    throttle.recordFailure(["identity:acme:c@example.com", address]);

    expect(throttle.check(["identity:acme:d@example.com", address]).allowed).toBe(false);
  });

  it("does not lock an unrelated user because someone else failed", () => {
    const clock = { now: 0 };
    const throttle = throttleAt(clock);
    for (let attempt = 0; attempt < 3; attempt += 1) throttle.recordFailure(identity);

    expect(throttle.check(["identity:acme:other@example.com"]).allowed).toBe(true);
  });
});

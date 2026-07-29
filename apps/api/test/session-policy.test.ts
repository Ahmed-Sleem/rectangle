/**
 * How long a sign-in lasts, and why it cannot be one number.
 *
 * The complaint was that people were signed out after an hour in the middle of
 * writing something up. The fix is not "make the hour longer" — that trades the
 * interruption for a stolen token being useful for longer, and picks the wrong
 * side of the trade twice. It is an idle deadline that moves while somebody
 * works, bounded by a cap that never moves.
 *
 * Both halves are tested here because either one alone is a known failure:
 * sliding without a cap can be held open forever by a background poll, and a
 * cap without sliding is the stopwatch that caused the complaint.
 */
import { describe, expect, it } from "vitest";
import {
  absoluteTimeoutSeconds,
  idleTimeoutSeconds,
  nextIdleDeadline,
  sessionDeadlines,
  slideAfterSeconds,
  tokenLifetimeSeconds,
} from "../src/domain/session-policy.js";

const NOW = new Date("2026-07-29T09:00:00.000Z");
const seconds = (value: number) => value * 1000;

describe("session deadlines", () => {
  it("gives a new session an idle deadline and a cap, from one clock reading", () => {
    const { expiresAt, absoluteExpiresAt } = sessionDeadlines(NOW);
    expect(new Date(expiresAt).getTime()).toBe(NOW.getTime() + seconds(idleTimeoutSeconds));
    expect(new Date(absoluteExpiresAt).getTime()).toBe(NOW.getTime() + seconds(absoluteTimeoutSeconds));
  });

  it("caps a session no earlier than it would go idle", () => {
    // A cap shorter than the idle window would make the idle window decorative
    // and reintroduce a fixed stopwatch under a different name.
    expect(absoluteTimeoutSeconds).toBeGreaterThanOrEqual(idleTimeoutSeconds);
  });

  it("keeps the token alive as long as the session it names", () => {
    // A token expiring first is the original bug wearing a different hat: the
    // row is still valid and the person is signed out anyway.
    expect(tokenLifetimeSeconds).toBe(absoluteTimeoutSeconds);
  });

  it("lasts a working day, which is the unit an office thinks in", () => {
    // Stated as a fact rather than a range, so shortening it to something that
    // interrupts people again is a deliberate edit with a failing test.
    expect(idleTimeoutSeconds).toBe(8 * 60 * 60);
  });
});

describe("sliding the idle deadline", () => {
  const capFarAway = new Date(NOW.getTime() + seconds(absoluteTimeoutSeconds));

  it("moves the deadline forward for somebody still working", () => {
    const current = new Date(NOW.getTime() + seconds(idleTimeoutSeconds - 60 * 60));
    const next = nextIdleDeadline(current, capFarAway, NOW);
    expect(next).not.toBeNull();
    expect(new Date(String(next)).getTime()).toBe(NOW.getTime() + seconds(idleTimeoutSeconds));
  });

  it("declines to write when the deadline has barely moved", () => {
    /*
     * Every authenticated request passes through here, and a page that fires
     * five queries at once would otherwise write the same row five times to
     * move a deadline by milliseconds.
     */
    const current = new Date(NOW.getTime() + seconds(idleTimeoutSeconds - 10));
    expect(nextIdleDeadline(current, capFarAway, NOW)).toBeNull();
  });

  it("writes once the drift is worth a write", () => {
    const current = new Date(NOW.getTime() + seconds(idleTimeoutSeconds - slideAfterSeconds));
    expect(nextIdleDeadline(current, capFarAway, NOW)).not.toBeNull();
  });

  it("never slides past the cap, however long somebody keeps working", () => {
    /*
     * The whole point of the cap. Without this the idle timer would push it
     * forward on every request and a session would live forever, which is what
     * an idle timeout on its own always permits.
     */
    const nearCap = new Date(NOW.getTime() + seconds(30 * 60));
    const current = new Date(NOW.getTime() - seconds(60));
    const next = nextIdleDeadline(current, nearCap, NOW);
    expect(new Date(String(next)).getTime()).toBe(nearCap.getTime());
  });

  it("stops writing entirely once the cap is reached", () => {
    // At the cap there is nothing left to extend, so the row should be left
    // alone rather than rewritten with the value it already holds.
    const cap = new Date(NOW.getTime() + seconds(30));
    const current = cap;
    expect(nextIdleDeadline(current, cap, NOW)).toBeNull();
  });
});

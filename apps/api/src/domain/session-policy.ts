/**
 * How long a sign-in lasts.
 *
 * One module because the numbers were previously a `const` repeated in three
 * services, and three copies of a security parameter is two chances to change
 * it in one place and believe you have changed it everywhere.
 *
 * The model is the pair OWASP asks for, and neither half works alone. An idle
 * deadline moves forward while somebody is working, so a person writing up a
 * site visit is never signed out mid-sentence — but on its own it lets a tab
 * polling in the background keep a session alive forever, which is precisely
 * what a stolen token would do. An absolute cap is fixed at sign-in and never
 * moves, which bounds that, but on its own it is the stopwatch that caused the
 * complaint. Whichever comes first ends the session.
 *
 * The values suit a construction office: a working day is the unit people think
 * in, and being asked to sign in again once a day is a thing nobody notices.
 * They are not tuned for a bank, and if this product ever holds payment
 * instructions they should come down.
 */

/** How long a session survives with no requests at all. */
export const idleTimeoutSeconds = 8 * 60 * 60;

/** The longest a session can live, however active. Never extended. */
export const absoluteTimeoutSeconds = 12 * 60 * 60;

/**
 * How much of the idle window must pass before a request writes the deadline
 * forward.
 *
 * Without this every authenticated request becomes a write, which on a page
 * that fires several queries at once means several pointless updates to the
 * same row and a write amplification nobody asked for. Sliding a little late is
 * invisible; the person only notices if they were about to be signed out, and
 * a minute of slack against an eight hour window is not that.
 */
export const slideAfterSeconds = 5 * 60;

/** The two deadlines a new session gets, from one clock reading. */
export function sessionDeadlines(now: Date = new Date()): {
  expiresAt: string;
  absoluteExpiresAt: string;
} {
  return {
    expiresAt: new Date(now.getTime() + idleTimeoutSeconds * 1000).toISOString(),
    absoluteExpiresAt: new Date(now.getTime() + absoluteTimeoutSeconds * 1000).toISOString(),
  };
}

/**
 * The idle deadline a request should write, or null to leave the row alone.
 *
 * Never past the absolute cap: sliding up to it and no further is what keeps
 * the cap meaning what it says, rather than becoming a suggestion the idle
 * timer can push around.
 */
export function nextIdleDeadline(
  currentExpiresAt: Date,
  absoluteExpiresAt: Date,
  now: Date = new Date(),
): string | null {
  const proposed = new Date(now.getTime() + idleTimeoutSeconds * 1000);
  const capped = proposed > absoluteExpiresAt ? absoluteExpiresAt : proposed;
  if (capped.getTime() - currentExpiresAt.getTime() < slideAfterSeconds * 1000) return null;
  return capped.toISOString();
}

/**
 * The JWT's own lifetime, which has to be the absolute cap.
 *
 * Shorter and the token dies while the session it names is still valid, which
 * is the bug being fixed wearing a different hat. Longer and a token outlives
 * the row, which would matter if the row ever stopped being consulted — it is
 * checked on every request today, and this keeps the two honest anyway.
 */
export const tokenLifetimeSeconds = absoluteTimeoutSeconds;

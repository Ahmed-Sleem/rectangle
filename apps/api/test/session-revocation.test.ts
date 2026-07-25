/**
 * Guards the rule that a session is only as valid as the account behind it.
 *
 * This is asserted against the SQL text because the behaviour lives in the
 * query, not in TypeScript: session lookup joins `users` and requires an active
 * status. Without it a disabled account keeps working until its token expires,
 * so "disable" would stop someone signing in again while leaving whoever is
 * already signed in untouched.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const repositorySource = readFileSync(
  new URL("../src/infrastructure/postgres/auth-repository.ts", import.meta.url),
  "utf8",
);

function activeSessionQuery(): string {
  const start = repositorySource.indexOf("async findActiveSession");
  expect(start, "findActiveSession must exist").toBeGreaterThan(-1);
  const end = repositorySource.indexOf("async ", start + 10);
  return repositorySource.slice(start, end === -1 ? undefined : end);
}

describe("session validity", () => {
  it("rechecks the account status on every request, not only at login", () => {
    const query = activeSessionQuery();
    expect(query).toMatch(/join\s+users\b/iu);
    expect(query).toMatch(/u\.status\s*=\s*'active'/iu);
  });

  it("still requires the session itself to be live", () => {
    const query = activeSessionQuery();
    expect(query).toMatch(/revoked_at\s+is\s+null/iu);
    expect(query).toMatch(/expires_at\s*>\s*now\(\)/iu);
  });

  it("offers a way to end every session for one person", () => {
    expect(repositorySource).toMatch(/async revokeAllSessionsForUser/u);
    const start = repositorySource.indexOf("async revokeAllSessionsForUser");
    const body = repositorySource.slice(start, start + 400);
    // Must not be scoped to a single session id, or it would revoke only one.
    expect(body).toMatch(/where tenant_id = \$1 and user_id = \$2/u);
  });
});

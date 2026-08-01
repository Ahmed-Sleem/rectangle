/**
 * Authority must come from the database on every request, not from the token.
 *
 * A JWT records what someone could do when they signed in. If the API trusts
 * that, an administrator who revokes access has not actually revoked anything
 * until the token expires — which is the difference between a permission
 * system and a suggestion.
 */
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { createAuthenticationHook } from "../src/http/auth.js";
import type { FastifyReply, FastifyRequest } from "fastify";

const jwtSecret = "rectangle-test-secret-must-be-at-least-32-chars";
const tenantId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";

async function tokenWith(claims: Record<string, unknown>) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(new TextEncoder().encode(jwtSecret));
}

function requestWith(token: string): FastifyRequest {
  return { headers: { authorization: `Bearer ${token}` } } as unknown as FastifyRequest;
}

const reply = {} as FastifyReply;

describe("live authority", () => {
  it("uses the roles the database reports, not the ones inside the token", async () => {
    // The token claims administrator; the database says the role was removed.
    const token = await tokenWith({ tenant_id: tenantId, roles: ["owner"], sid: sessionId });
    const hook = createAuthenticationHook(jwtSecret, async () => ({
      roles: ["none"],
      permissions: ["projects.read"],
    }));

    const request = requestWith(token);
    await hook(request, reply);

    expect(request.principal.roles).toEqual(["none"]);
    expect(request.principal.permissions).toEqual(["projects.read"]);
  });

  it("rejects a request whose session has ended", async () => {
    const token = await tokenWith({ tenant_id: tenantId, roles: ["owner"], sid: sessionId });
    const hook = createAuthenticationHook(jwtSecret, async () => null);

    await expect(hook(requestWith(token), reply)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("refuses a token carrying no session, rather than skipping the check", async () => {
    // Fail closed: an unverifiable token is not a trusted one.
    const token = await tokenWith({ tenant_id: tenantId, roles: ["owner"] });
    let consulted = false;
    const hook = createAuthenticationHook(jwtSecret, async () => {
      consulted = true;
      return { roles: ["owner"], permissions: [] };
    });

    await expect(hook(requestWith(token), reply)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    expect(consulted).toBe(false);
  });

  it("still rejects a token that was not signed by this server", async () => {
    const token = await new SignJWT({ tenant_id: tenantId, roles: ["owner"], sid: sessionId })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(new TextEncoder().encode("a-completely-different-secret-value-32"));
    const hook = createAuthenticationHook(jwtSecret, async () => ({ roles: ["none"], permissions: [] }));

    await expect(hook(requestWith(token), reply)).rejects.toThrow();
  });
});

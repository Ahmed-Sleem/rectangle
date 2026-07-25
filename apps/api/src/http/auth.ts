/**
 * HTTP authentication verifies signed bearer/cookie tokens and exposes a
 * normalized user principal to route handlers without hardcoded users.
 */
import type { FastifyReply, FastifyRequest } from "fastify";
import { jwtVerify } from "jose";
import { z } from "zod";
import { userPrincipalSchema, type UserPrincipal } from "../domain/auth.js";
import { DomainError } from "../domain/errors.js";
import { readCookie, sessionCookieName } from "./session-cookie.js";

const jwtClaimsSchema = z.object({
  sub: z.uuid(),
  tenant_id: z.uuid(),
  roles: z.array(z.string()).min(1).max(20),
  permissions: z.array(z.string()).optional().default([]),
  sid: z.uuid().optional(),
});

declare module "fastify" {
  interface FastifyRequest {
    principal: UserPrincipal;
  }
}

function extractAuthToken(request: FastifyRequest): string {
  const header = request.headers.authorization;
  if (header) {
    const match = /^Bearer\s+(.+)$/iu.exec(header);
    if (match?.[1]) return match[1];
  }
  const cookieToken = readCookie(request, sessionCookieName);
  if (cookieToken) return cookieToken;
  throw new DomainError("UNAUTHENTICATED", "Authentication is required.");
}

export interface ResolvedAuthority {
  roles: string[];
  permissions: string[];
}

export function createAuthenticationHook(
  jwtSecret: string,
  resolveSession?: (
    sessionId: string,
    tenantId: string,
    userId: string,
  ) => Promise<ResolvedAuthority | null>,
) {
  const secret = new TextEncoder().encode(jwtSecret);

  return async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const token = extractAuthToken(request);
    const verified = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    const claims = jwtClaimsSchema.safeParse(verified.payload);
    if (!claims.success) {
      throw new DomainError("UNAUTHENTICATED", "Token claims are invalid.");
    }

    // Authority comes from the database, not the token. A token records what
    // the user could do when they signed in; only the live row says what they
    // may do now, which is what matters when access has just been revoked.
    let roles: string[] = claims.data.roles;
    let permissions: string[] = claims.data.permissions;

    if (resolveSession) {
      // Fail closed: a token with no session id cannot be validated, so it is
      // not accepted rather than quietly skipping the check.
      if (!claims.data.sid) {
        throw new DomainError("UNAUTHENTICATED", "Session is no longer active.");
      }

      const authority = await resolveSession(claims.data.sid, claims.data.tenant_id, claims.data.sub);
      if (!authority) {
        throw new DomainError("UNAUTHENTICATED", "Session is no longer active.");
      }

      roles = authority.roles;
      permissions = authority.permissions;
    }

    const principal = userPrincipalSchema.safeParse({
      userId: claims.data.sub,
      tenantId: claims.data.tenant_id,
      roles,
      permissions,
      sessionId: claims.data.sid,
    });
    if (!principal.success) {
      throw new DomainError("UNAUTHENTICATED", "Token roles are invalid.");
    }

    request.principal = principal.data;
  };
}

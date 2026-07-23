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

export function createAuthenticationHook(
  jwtSecret: string,
  verifySession?: (sessionId: string, tenantId: string, userId: string) => Promise<boolean>,
) {
  const secret = new TextEncoder().encode(jwtSecret);

  return async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const token = extractAuthToken(request);
    const verified = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    const claims = jwtClaimsSchema.safeParse(verified.payload);
    if (!claims.success) {
      throw new DomainError("UNAUTHENTICATED", "Token claims are invalid.");
    }

    const principal = userPrincipalSchema.safeParse({
      userId: claims.data.sub,
      tenantId: claims.data.tenant_id,
      roles: claims.data.roles,
      sessionId: claims.data.sid,
    });
    if (!principal.success) {
      throw new DomainError("UNAUTHENTICATED", "Token roles are invalid.");
    }

    if (verifySession && principal.data.sessionId) {
      const active = await verifySession(principal.data.sessionId, principal.data.tenantId, principal.data.userId);
      if (!active) {
        throw new DomainError("UNAUTHENTICATED", "Session is no longer active.");
      }
    }

    request.principal = principal.data;
  };
}

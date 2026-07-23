/**
 * Session cookie helpers keep browser auth same-origin and httpOnly without a
 * cookie plugin dependency in the production server.
 */
import type { FastifyReply, FastifyRequest } from "fastify";

export const sessionCookieName = "rectangle_session";

export function readCookie(request: FastifyRequest, name: string): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === name) {
      return decodeURIComponent(rawValue.join("="));
    }
  }
  return undefined;
}

export function setSessionCookie(reply: FastifyReply, token: string, expiresAt: string): void {
  const secure = process.env.NODE_ENV === "production";
  const parts = [
    `${sessionCookieName}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Expires=${new Date(expiresAt).toUTCString()}`,
  ];
  if (secure) parts.push("Secure");
  reply.header("Set-Cookie", parts.join("; "));
}

export function clearSessionCookie(reply: FastifyReply): void {
  const secure = process.env.NODE_ENV === "production";
  const parts = [
    `${sessionCookieName}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];
  if (secure) parts.push("Secure");
  reply.header("Set-Cookie", parts.join("; "));
}

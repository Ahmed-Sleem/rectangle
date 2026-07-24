/** Passkey routes expose WebAuthn registration and login ceremonies. */
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { PasskeyService, RelyingPartyInfo } from "../application/passkey-service.js";
import { setSessionCookie } from "./session-cookie.js";

function relyingPartyFromRequest(request: FastifyRequest): RelyingPartyInfo {
  const origin = request.headers.origin ?? `${request.protocol}://${request.headers.host}`;
  const host = String(request.headers.host ?? "localhost").split(":")[0] || "localhost";
  return { origin: String(origin), rpID: host };
}

export async function registerPasskeyRoutes(
  app: FastifyInstance,
  passkeyService: Pick<PasskeyService, "list" | "beginRegistration" | "verifyRegistration" | "beginLogin" | "verifyLogin">,
): Promise<void> {
  app.get("/v1/auth/passkeys", async (request) => passkeyService.list(request.principal));
  app.post("/v1/auth/passkeys/register/options", async (request) => passkeyService.beginRegistration(request.principal, relyingPartyFromRequest(request)));
  app.post("/v1/auth/passkeys/register/verify", async (request) => passkeyService.verifyRegistration(request.principal, relyingPartyFromRequest(request), request.body as never));
  app.post("/v1/auth/passkeys/login/options", async (request) => passkeyService.beginLogin(request.body, relyingPartyFromRequest(request)));
  app.post("/v1/auth/passkeys/login/verify", async (request, reply) => {
    const userAgent = request.headers["user-agent"];
    const result = await passkeyService.verifyLogin(request.body, relyingPartyFromRequest(request), { ...(userAgent ? { userAgent } : {}), ipAddress: request.ip });
    setSessionCookie(reply, result.accessToken, result.expiresAt);
    return reply.send(result);
  });
}

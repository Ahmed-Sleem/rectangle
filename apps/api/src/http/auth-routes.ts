/**
 * Authentication HTTP routes issue and clear real sessions through AuthService.
 * They do not seed users, bypass password checks, or provide fake login behavior.
 */
import type { FastifyInstance } from "fastify";
import type { AuthService } from "../application/auth-service.js";
import { clearSessionCookie, setSessionCookie } from "./session-cookie.js";

export async function registerAuthRoutes(app: FastifyInstance, authService: AuthService): Promise<void> {
  app.post("/v1/auth/login", async (request, reply) => {
    const userAgent = request.headers["user-agent"];
    const result = await authService.login(request.body, {
      ...(userAgent ? { userAgent } : {}),
      ipAddress: request.ip,
    });
    setSessionCookie(reply, result.accessToken, result.expiresAt);
    return reply.status(200).send(result);
  });

  app.get("/v1/me", async (request) => ({ user: request.principal }));

  app.post("/v1/auth/logout", async (request, reply) => {
    await authService.logout({
      tenantId: request.principal.tenantId,
      userId: request.principal.userId,
      ...(request.principal.sessionId ? { sessionId: request.principal.sessionId } : {}),
    });
    clearSessionCookie(reply);
    return reply.status(204).send();
  });
}

/**
 * Authentication HTTP routes issue real sessions through AuthService. They do
 * not seed users, bypass password checks, or provide fake login behavior.
 */
import type { FastifyInstance } from "fastify";
import type { AuthService } from "../application/auth-service.js";

export async function registerAuthRoutes(app: FastifyInstance, authService: AuthService): Promise<void> {
  app.post("/v1/auth/login", async (request, reply) => {
    const userAgent = request.headers["user-agent"];
    const result = await authService.login(request.body, {
      ...(userAgent ? { userAgent } : {}),
      ipAddress: request.ip,
    });
    return reply.status(200).send(result);
  });
}

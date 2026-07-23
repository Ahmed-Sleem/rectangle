/** Setup routes expose the one-time first company/admin bootstrap flow. */
import type { FastifyInstance } from "fastify";
import type { SetupService } from "../application/setup-service.js";
import { setSessionCookie } from "./session-cookie.js";

export async function registerSetupRoutes(
  app: FastifyInstance,
  setupService: Pick<SetupService, "getStatus" | "createFirstAdmin">,
): Promise<void> {
  app.get("/v1/setup/status", async () => setupService.getStatus());

  app.post("/v1/setup/first-admin", async (request, reply) => {
    const userAgent = request.headers["user-agent"];
    const result = await setupService.createFirstAdmin(request.body, {
      ...(userAgent ? { userAgent } : {}),
      ipAddress: request.ip,
    });
    setSessionCookie(reply, result.accessToken, result.expiresAt);
    return reply.status(201).send(result);
  });
}

/** Settings routes manage tenant-level configuration such as SMTP email. */
import type { FastifyInstance } from "fastify";
import type { EmailSettingsService } from "../application/email-settings-service.js";

export async function registerSettingsRoutes(
  app: FastifyInstance,
  emailSettingsService: Pick<EmailSettingsService, "getSettings" | "saveSettings" | "sendTestEmail">,
): Promise<void> {
  app.get("/v1/settings/email", async (request) => emailSettingsService.getSettings(request.principal));

  app.put("/v1/settings/email", async (request) => emailSettingsService.saveSettings(request.principal, request.body));

  app.post("/v1/settings/email/test", async (request) => emailSettingsService.sendTestEmail(request.principal, request.body));
}

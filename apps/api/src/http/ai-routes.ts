/**
 * The assistant's endpoints.
 *
 * Thin on purpose, like every other route file here: no permission check, no
 * validation and no branching, because each of those has exactly one home in
 * the service layer and a second copy in a handler is a second answer waiting
 * to disagree. What the routes do carry is the shape of the conversation —
 * asking and confirming are separate requests, and that separation is the
 * whole reason a person gets to approve anything.
 */
import type { FastifyInstance } from "fastify";
import type { AiService } from "../application/ai-service.js";
import type { AiSettingsService } from "../application/ai-settings-service.js";

export async function registerAiRoutes(
  app: FastifyInstance,
  aiService: Pick<AiService, "chat" | "confirm">,
  aiSettingsService: Pick<AiSettingsService, "getSettings" | "saveSettings" | "saveMyKey" | "deleteMyKey">,
): Promise<void> {
  /*
   * One turn of the conversation. Stateless: the client sends the history it
   * has, which keeps a chat from becoming server state that has to be expired,
   * migrated and cleaned up. The reply is either an answer or a proposal
   * awaiting confirmation — never both, because the loop stops the moment the
   * model reaches for something that changes data.
   */
  app.post("/v1/ai/chat", async (request) => aiService.chat(request.principal, request.body));

  /*
   * Approving a proposed change. The body carries only an identifier: the
   * arguments that execute are read from the row written when the proposal was
   * made, so what runs is what the person was shown.
   */
  app.post("/v1/ai/confirm", async (request) => aiService.confirm(request.principal, request.body));

  app.get("/v1/ai/settings", async (request) => ({
    aiSettings: await aiSettingsService.getSettings(request.principal),
  }));

  app.put("/v1/ai/settings", async (request) => ({
    aiSettings: await aiSettingsService.saveSettings(request.principal, request.body),
  }));

  /* A person's own key. No id in the path: it acts on whoever is asking. */
  app.put("/v1/ai/key", async (request) => aiSettingsService.saveMyKey(request.principal, request.body));

  app.delete("/v1/ai/key", async (request) => aiSettingsService.deleteMyKey(request.principal));
}

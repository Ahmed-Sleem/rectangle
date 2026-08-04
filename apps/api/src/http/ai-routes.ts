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
import { DomainError } from "../domain/errors.js";
import type { AiService } from "../application/ai-service.js";
import type { AiSettingsService } from "../application/ai-settings-service.js";

export async function registerAiRoutes(
  app: FastifyInstance,
  aiService: Pick<
    AiService,
    | "chat"
    | "confirm"
    | "listConversations"
    | "branchConversation"
    | "readConversation"
    | "renameConversation"
    | "deleteConversation"
    | "deleteAllConversations"
    | "listAutoApprovals"
    | "grantAutoApproval"
    | "revokeAutoApproval"
  >,
  aiSettingsService: Pick<AiSettingsService, "getSettings" | "saveSettings" | "saveMyProvider" | "deleteMyProvider" | "chooseProvider">,
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
   * The same turn, reported as it happens.
   *
   * Server-sent events rather than a websocket: the traffic is one-directional
   * and short-lived, SSE survives proxies that mangle upgrades, and it needs no
   * connection state on the server. The browser posts the question and reads
   * the steps back off the same response.
   *
   * A POST, despite SSE conventionally being a GET, because the request carries
   * a message body and putting somebody's question in a query string would put
   * it in every access log between here and them.
   *
   * The non-streaming route above stays. This one is an addition, so a client
   * that cannot stream — or a test that does not want to — still works.
   */
  app.post("/v1/ai/chat/stream", async (request, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Nginx and several PaaS proxies buffer responses by default, which
      // holds every event until the request ends and turns a live progress
      // feed into one silent wait followed by everything at once.
      "X-Accel-Buffering": "no",
    });

    const send = (event: unknown) => {
      // One JSON object per event, newline-delimited as the protocol requires.
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      await aiService.chat(request.principal, request.body, send);
    } catch (error) {
      /*
       * The status line has already gone, so a failure cannot become a 4xx or
       * 5xx any more. It is reported as a final event instead, and the client
       * shows it the same way it shows any other failure. Swallowing it would
       * leave the person watching a feed that simply stopped.
       */
      send({
        type: "failed",
        message:
          error instanceof DomainError
            ? error.message
            : "The assistant could not finish that. Please try again.",
        /*
         * The code travels with the message because some failures have a
         * remedy the client can offer and most do not. A conversation that
         * outgrew the model is the case in point: the panel can propose
         * carrying on in a fresh thread, but only if it can tell that failure
         * apart from the provider simply being down. On the plain endpoint the
         * HTTP body carries the code; on this one the status line has already
         * gone, so without this the streaming path — which is the normal path —
         * would lose the distinction entirely.
         */
        ...(error instanceof DomainError ? { code: error.code } : {}),
      });
    } finally {
      reply.raw.end();
    }

    return reply;
  });

  /*
   * Approving a proposed change. The body carries only an identifier: the
   * arguments that execute are read from the row written when the proposal was
   * made, so what runs is what the person was shown.
   */
  app.post("/v1/ai/confirm", async (request) => aiService.confirm(request.principal, request.body));

  /*
   * The conversations. Read paths take the identifier from the route and the
   * owner from the session, never both from the caller: there is no way to
   * name whose thread is wanted, so there is no way to ask for somebody
   * else's.
   */
  /*
   * Tools this person has chosen not to be asked about. No id in the path: it
   * acts on whoever is asking, so there is nowhere to name somebody else's
   * preferences and therefore no way to change them.
   */
  app.get("/v1/ai/auto-approvals", async (request) =>
    aiService.listAutoApprovals(request.principal),
  );

  app.put("/v1/ai/auto-approvals", async (request) =>
    aiService.grantAutoApproval(request.principal, request.body),
  );

  app.delete("/v1/ai/auto-approvals", async (request) =>
    aiService.revokeAutoApproval(request.principal, request.body),
  );

  app.get("/v1/ai/conversations", async (request) =>
    aiService.listConversations(request.principal, request.query),
  );

  /*
   * POST because it creates a thread. Named for what it does to the record
   * rather than for the failure that prompts it: the same operation is useful
   * whenever somebody wants to carry on from a point without dragging the
   * whole history along.
   */
  app.post("/v1/ai/conversations/:conversationId/branch", async (request) =>
    aiService.branchConversation(request.principal, request.params),
  );

  app.get("/v1/ai/conversations/:conversationId", async (request) =>
    aiService.readConversation(request.principal, request.params),
  );

  app.patch("/v1/ai/conversations/:conversationId", async (request) =>
    aiService.renameConversation(request.principal, {
      ...(request.body as Record<string, unknown>),
      ...(request.params as Record<string, unknown>),
    }),
  );

  /*
   * Before the parameterised route, deliberately. Fastify matches a static
   * segment ahead of a parameter, but the ordering is stated here anyway so
   * nobody later reads "all" as a conversation id.
   */
  app.delete("/v1/ai/conversations/all", async (request) =>
    aiService.deleteAllConversations(request.principal),
  );

  app.delete("/v1/ai/conversations/:conversationId", async (request) =>
    aiService.deleteConversation(request.principal, request.params),
  );

  app.get("/v1/ai/settings", async (request) => ({
    aiSettings: await aiSettingsService.getSettings(request.principal),
  }));

  app.put("/v1/ai/settings", async (request) => ({
    aiSettings: await aiSettingsService.saveSettings(request.principal, request.body),
  }));

  /*
   * A person's own provider. No id in the path: it acts on whoever is asking,
   * so there is nowhere to name somebody else's settings and therefore no way
   * to change them.
   */
  app.put("/v1/ai/me", async (request) => ({
    aiSettings: await aiSettingsService.saveMyProvider(request.principal, request.body),
  }));

  /* Choosing between two configurations that both exist. */
  app.put("/v1/ai/me/preferred", async (request) => ({
    aiSettings: await aiSettingsService.chooseProvider(request.principal, request.body),
  }));

  app.delete("/v1/ai/me", async (request) => ({
    aiSettings: await aiSettingsService.deleteMyProvider(request.principal),
  }));
}

/**
 * What the panel says to the server.
 *
 * The transcript is not in any request body here, and that absence is the whole
 * contract: a turn carries one message and the identifier of the thread it
 * belongs to, and the server replies with the thread it wrote to. So the client
 * cannot present the model with a conversation that differs from the stored one,
 * because the client does not send a conversation at all.
 *
 * Confirming a proposed change carries only an identifier for the same reason.
 * The arguments that execute are read from the row written when the proposal was
 * made, so editing them in the browser between being shown the card and pressing
 * the button changes nothing — which is what makes the approval mean something.
 */
import { apiRequest } from "@/shared/api/client";

/** A change the assistant wants to make, waiting to be approved or ignored. */
export interface AiProposal {
  id: string;
  tool: string;
  /** The validated arguments themselves, shown verbatim. Never a paraphrase. */
  summary: Record<string, unknown>;
}

export interface AiChatResponse {
  conversationId: string;
  answer: string;
  /** Which tools the answer was built from, so it can be judged. */
  usedTools: string[];
  proposal?: AiProposal;
}

export interface AiStoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  usedTools: string[];
  createdAt: string;
}

export interface AiConversationSummary {
  id: string;
  title: string;
  projectId: string | null;
  updatedAt: string;
}

export interface AiChatRequest {
  /** Absent starts a new thread. */
  conversationId?: string;
  message: string;
  /** The project being looked at, so "how is it going" means something. */
  projectId?: string;
}

export const shellAiApi = {
  chat: (payload: AiChatRequest) =>
    apiRequest<AiChatResponse>("/v1/ai/chat", { method: "POST", body: JSON.stringify(payload) }),

  confirm: (actionId: string) =>
    apiRequest<{ done: true; tool: string }>("/v1/ai/confirm", {
      method: "POST",
      body: JSON.stringify({ actionId }),
    }),

  listConversations: () =>
    apiRequest<{ conversations: AiConversationSummary[] }>("/v1/ai/conversations"),

  readConversation: (conversationId: string) =>
    apiRequest<{ conversation: AiConversationSummary; messages: AiStoredMessage[] }>(
      `/v1/ai/conversations/${conversationId}`,
    ),

  deleteConversation: (conversationId: string) =>
    apiRequest<{ deleted: true }>(`/v1/ai/conversations/${conversationId}`, { method: "DELETE" }),

  /** Read by the panel to explain itself when it cannot answer anything. */
  getSettings: () =>
    apiRequest<{
      aiSettings: {
        configured: boolean;
        enabled: boolean;
        hasCompanyKey: boolean;
        hasPersonalKey: boolean;
        ready: boolean;
      };
    }>("/v1/ai/settings"),
};

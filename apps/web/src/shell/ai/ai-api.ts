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

/** A step the assistant took, reported while it is still working. */
export type AiProgressEvent =
  | { type: "cycle"; cycle: number; total: number }
  | { type: "tool"; cycle: number; tool: string; arguments: Record<string, unknown> }
  | { type: "observation"; cycle: number; tool: string; summary: string }
  | { type: "answer"; result: AiChatResponse }
  | { type: "failed"; message: string };

export interface AiChatResponse {
  conversationId: string;
  answer: string;
  /** Which tools the answer was built from, so it can be judged. */
  usedTools: string[];
  proposal?: AiProposal;
  /** True when it stopped because it ran out of steps, not because it finished. */
  exhausted?: boolean;
  cyclesUsed?: number;
  cycleLimit?: number;
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
  /** Set when the person asked it to keep going after it ran out of steps. */
  continue?: boolean;
}

/**
 * One turn, reported step by step.
 *
 * Reads the server-sent event stream by hand rather than with `EventSource`,
 * because that API can only issue a GET and the question belongs in a body —
 * putting somebody's words in a query string would write them into every access
 * log on the way. `fetch` with a reader does the same job and keeps the request
 * a POST.
 *
 * Falls back to the ordinary endpoint when streaming is unavailable, so a proxy
 * that mangles event streams degrades to a slower experience rather than a
 * broken one.
 */
export async function streamChat(
  payload: AiChatRequest,
  onEvent: (event: AiProgressEvent) => void,
  signal?: AbortSignal,
): Promise<AiChatResponse> {
  const response = await fetch("/v1/ai/chat/stream", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    ...(signal ? { signal } : {}),
  });

  if (!response.ok || !response.body) {
    // Not an error yet: the plain endpoint answers the same question, just
    // without the running commentary.
    return shellAiApi.chat(payload);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer: AiChatResponse | undefined;
  let failure: string | undefined;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    /*
     * Events are separated by a blank line and may arrive split across reads,
     * so the tail of the buffer is kept until its terminator turns up. Parsing
     * whatever happened to be in one chunk would drop every event that
     * straddled a boundary — rare on a fast connection and constant on a slow
     * one, which is exactly when the feed matters.
     */
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const line = part.split("\n").find((entry) => entry.startsWith("data:"));
      if (!line) continue;

      try {
        const event = JSON.parse(line.slice(5).trim()) as AiProgressEvent;
        onEvent(event);
        if (event.type === "answer") answer = event.result;
        if (event.type === "failed") failure = event.message;
      } catch {
        // A malformed frame is not worth losing the rest of the stream over.
      }
    }
  }

  if (failure) throw new Error(failure);
  if (!answer) throw new Error("The assistant stopped before answering.");
  return answer;
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

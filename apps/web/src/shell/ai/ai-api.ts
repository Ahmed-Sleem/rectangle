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
import { ApiClientError, apiRequest } from "@/shared/api/client";
import type { AiSettingsView } from "@/features/settings/ai-api";

/** A change the assistant wants to make, waiting to be approved or ignored. */
export interface AiProposal {
  id: string;
  tool: string;
  /** The validated arguments themselves, shown verbatim. Never a paraphrase. */
  summary: Record<string, unknown>;
  /**
   * Cannot be undone. These never offer "do not ask again" — the server refuses
   * such a preference even if one were sent, and the card must not imply
   * otherwise.
   */
  destructive: boolean;
}

/** A step the assistant took, reported while it is still working. */
export type AiProgressEvent =
  | { type: "cycle"; cycle: number; total: number }
  | { type: "tool"; cycle: number; tool: string; arguments: Record<string, unknown> }
  | { type: "observation"; cycle: number; tool: string; summary: string }
  | { type: "answer"; result: AiChatResponse }
  | { type: "failed"; message: string; code?: string };

export interface AiChatResponse {
  conversationId: string;
  answer: string;
  /** Which tools the answer was built from, so it can be judged. */
  usedTools: string[];
  /** Changes waiting for approval. Several may come from one instruction. */
  proposals?: AiProposal[];
  /** Changes that ran unasked, because this person had already agreed to them. */
  performed?: { tool: string; summary: Record<string, unknown> }[];
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

/** A page of threads, with the bookmark for the next one. */
export interface AiConversationPage {
  conversations: AiConversationSummary[];
  /** Null when this is the last page. */
  nextCursor: string | null;
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
  /**
   * What is on the person's screen.
   *
   * Sent with the request but NOT put in the prompt: the model reads it only if
   * it calls `current_screen`, which it does when a question says "this" or
   * "here" and not otherwise. That replaced a toggle in the composer that
   * attached the current project to every message — which spent tokens on
   * context most questions did not need and could only ever carry a project, so
   * on Tasks or Team the assistant knew nothing at all.
   */
  screen?: {
    route?: string;
    pageName?: string;
    projectId?: string;
    taskId?: string;
    riskId?: string;
  };
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
  let failure: { message: string; code?: string } | undefined;

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
        if (event.type === "failed") {
          failure = { message: event.message, ...(event.code ? { code: event.code } : {}) };
        }
      } catch {
        // A malformed frame is not worth losing the rest of the stream over.
      }
    }
  }

  /*
   * Rethrown as an ApiClientError rather than a bare Error so the panel reads a
   * streamed failure exactly as it reads one from the plain endpoint. A second
   * error shape here would mean a second place deciding what each failure means,
   * and the streaming path is the normal path — so the copy would be the one
   * that mattered. 0 for the status because there was never a failing status
   * line: the response was a healthy 200 that failed partway through.
   */
  if (failure) {
    throw new ApiClientError(0, failure.code ?? "UPSTREAM_UNAVAILABLE", failure.message);
  }
  if (!answer) throw new Error("The assistant stopped before answering.");
  return answer;
}

export const shellAiApi = {
  chat: (payload: AiChatRequest) =>
    apiRequest<AiChatResponse>("/v1/ai/chat", { method: "POST", body: JSON.stringify(payload) }),

  /** Approves one or several proposals in a single act. */
  confirm: (actionIds: string[]) =>
    apiRequest<{ done: true; tool: string; results: { tool: string; ok: boolean }[] }>(
      "/v1/ai/confirm",
      { method: "POST", body: JSON.stringify({ actionIds }) },
    ),

  listAutoApprovals: () => apiRequest<{ tools: string[] }>("/v1/ai/auto-approvals"),

  grantAutoApproval: (tool: string) =>
    apiRequest<{ tools: string[] }>("/v1/ai/auto-approvals", {
      method: "PUT",
      body: JSON.stringify({ tool }),
    }),

  revokeAutoApproval: (tool: string) =>
    apiRequest<{ tools: string[] }>("/v1/ai/auto-approvals", {
      method: "DELETE",
      body: JSON.stringify({ tool }),
    }),

  /**
   * One page of threads, optionally filtered.
   *
   * The cursor is whatever the previous page returned and is never built here:
   * it names the last row the server actually sent, which is what keeps paging
   * correct while the list reorders underneath it — and asking the assistant
   * anything reorders it, since the list is sorted by last activity.
   */
  listConversations: (params: { cursor?: string; query?: string } = {}) => {
    const search = new URLSearchParams();
    if (params.cursor) search.set("cursor", params.cursor);
    if (params.query?.trim()) search.set("query", params.query.trim());
    const suffix = search.size > 0 ? `?${search.toString()}` : "";

    return apiRequest<AiConversationPage>(`/v1/ai/conversations${suffix}`);
  },

  /** Clears this person's whole history. Returns how many went. */
  deleteAllConversations: () =>
    apiRequest<{ deleted: number }>("/v1/ai/conversations/all", { method: "DELETE" }),

  /** Starts a fresh thread carrying the tail of one that outgrew the model. */
  branchConversation: (conversationId: string) =>
    apiRequest<{ conversation: AiConversationSummary; messages: AiStoredMessage[] }>(
      `/v1/ai/conversations/${conversationId}/branch`,
      { method: "POST" },
    ),

  readConversation: (conversationId: string) =>
    apiRequest<{ conversation: AiConversationSummary; messages: AiStoredMessage[] }>(
      `/v1/ai/conversations/${conversationId}`,
    ),

  deleteConversation: (conversationId: string) =>
    apiRequest<{ deleted: true }>(`/v1/ai/conversations/${conversationId}`, { method: "DELETE" }),

  /** Read by the panel to explain itself when it cannot answer anything. */
  /**
   * Read by the panel so it can explain itself when it cannot answer.
   *
   * The response type is imported from the settings feature rather than
   * declared again here. It WAS declared again here, with the fields the API
   * had in an earlier version, and when the server split the company and
   * personal providers into two objects this copy went on describing the old
   * shape — so `configured` was permanently undefined, the panel decided it was
   * not set up, and it told everybody so no matter what they had configured.
   * TypeScript could not catch it because the lie was in the type itself.
   *
   * One definition, two callers. That is the rule, and this is what breaking it
   * costs.
   */
  getSettings: () => apiRequest<{ aiSettings: AiSettingsView }>("/v1/ai/settings"),
};

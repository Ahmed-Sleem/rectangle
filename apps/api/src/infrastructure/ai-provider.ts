/**
 * The one place Rectangle talks to a language model.
 *
 * Every provider worth using now exposes the OpenAI chat-completions shape, so
 * speaking that one dialect is what makes the company's free-text endpoint
 * meaningful: point it at OpenAI, Azure, Anthropic through a gateway, or a
 * model running on the company's own hardware, and nothing here changes.
 *
 * Three things this module is careful about, each of which has bitten
 * somebody else in production:
 *
 *  - **The key never appears in an error.** A failed request carries the URL,
 *    the headers and sometimes the body into a log or an exception message. So
 *    failures are converted into a domain error with a message written here,
 *    and the provider's own text is included only after being stripped of
 *    anything resembling the key.
 *
 *  - **A request cannot hang.** A model that never answers would otherwise
 *    hold a worker until the process restarts. Every call carries an abort
 *    signal.
 *
 *  - **A malformed reply is a refusal, not a crash.** Providers return odd
 *    shapes when overloaded. The response is parsed defensively and anything
 *    unexpected becomes an error the harness can explain.
 */
import { DomainError } from "../domain/errors.js";

/** One entry in the conversation, in the shape every provider expects. */
export interface ProviderMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** Present on an assistant turn that asked for tools. */
  tool_calls?: ProviderToolCall[];
  /** Present on a tool result, tying it to the call it answers. */
  tool_call_id?: string;
}

export interface ProviderToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/** A tool as the provider expects to be told about it. */
export interface ProviderTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ProviderRequest {
  baseUrl: string;
  model: string;
  apiKey: string;
  messages: ProviderMessage[];
  tools: ProviderTool[];
  timeoutMs: number;
  /** Longest reply to generate. Omitted leaves the provider's own default. */
  maxOutputTokens?: number;
}

export interface ProviderReply {
  /** The model's prose. Empty when it only asked for tools. */
  content: string;
  toolCalls: ProviderToolCall[];
}

/**
 * Removes anything that looks like the key from text on its way to a log.
 *
 * Belt and braces: the key should never be in a provider's error message, but
 * some echo the request back, and a leaked credential is not the kind of
 * mistake worth risking on an assumption about somebody else's error format.
 */
function withoutSecret(text: string, apiKey: string): string {
  if (!apiKey) return text;
  return text.split(apiKey).join("[redacted]");
}

/**
 * Whether a rejected request was rejected for being too long.
 *
 * Kept beside the provider because it is a fact about what providers send, not
 * a rule about what Rectangle does, and it is deliberately generous. Every
 * phrase here was taken from a real response: the OpenAI family sets the code
 * and describes a maximum context length, Groq sets no code and asks only that
 * the messages be shortened. Anything OpenAI-compatible tends to echo one or
 * the other, since most of them were written against OpenAI's own wording.
 */
function looksLikeContextOverflow(body: string): boolean {
  const text = body.toLowerCase();

  return (
    text.includes("context_length_exceeded") ||
    text.includes("maximum context length") ||
    text.includes("context window") ||
    text.includes("reduce the length of the messages") ||
    text.includes("too many tokens")
  );
}

/** Joins a base URL to a path without caring whether it ends in a slash. */
function endpointFor(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/u, "");
  // A base URL that already names the endpoint is what people paste from a
  // provider's documentation, so accept it rather than producing a doubled path.
  return trimmed.endsWith("/chat/completions") ? trimmed : `${trimmed}/chat/completions`;
}

export interface AiProviderClient {
  complete(request: ProviderRequest): Promise<ProviderReply>;
}

export class OpenAiCompatibleProvider implements AiProviderClient {
  async complete(request: ProviderRequest): Promise<ProviderReply> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);

    let response: Response;
    try {
      response = await fetch(endpointFor(request.baseUrl), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${request.apiKey}`,
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          // Omitted entirely when there are none: some providers reject an
          // empty array, and a person with no permissions has no tools.
          ...(request.tools.length > 0 ? { tools: request.tools } : {}),
          /*
           * Low but not zero. This is a question-answering assistant over the
           * company's own records, where inventing a plausible number is the
           * worst thing it can do; a little variation keeps its prose readable
           * without loosening its grip on the facts.
           */
          temperature: 0.2,
          /*
           * Omitted rather than defaulted when unset. Every provider has its
           * own sensible ceiling, and inventing one here would silently cut
           * answers short on a model whose limit was higher.
           */
          ...(request.maxOutputTokens ? { max_tokens: request.maxOutputTokens } : {}),
        }),
        signal: controller.signal,
      });
    } catch (error) {
      // An abort and a network failure are different things to a person: one
      // is "it is being slow", the other is "it is not there".
      if (error instanceof Error && error.name === "AbortError") {
        throw new DomainError(
          "UPSTREAM_TIMEOUT",
          "The model did not answer in time. Try again, or check the endpoint in Settings.",
        );
      }
      throw new DomainError(
        "UPSTREAM_UNAVAILABLE",
        "Rectangle could not reach the model endpoint. Check the address in Settings.",
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const body = withoutSecret(await response.text().catch(() => ""), request.apiKey);

      /*
       * The conversation no longer fits, which is a different thing from the
       * provider being broken and needs a different offer: the person can carry
       * on in a new thread, and only they can decide to.
       *
       * Detected on two signals because one is not enough, and this was checked
       * against real providers rather than assumed. OpenAI and Azure set
       * `code: "context_length_exceeded"` and say "This model's maximum context
       * length is N tokens". Groq, measured directly, sets NO code at all and
       * returns only "Please reduce the length of the messages or completion."
       * — so a code-only test would have missed every Groq user, and a
       * message-only test would break the moment a provider rewrote its prose.
       *
       * Both are matched loosely and neither is required. A false positive
       * costs somebody an offer to start a fresh thread, which is harmless; a
       * false negative is the dead end this exists to remove.
       */
      if (response.status === 400 && looksLikeContextOverflow(body)) {
        throw new DomainError(
          "CONTEXT_TOO_LONG",
          "This conversation has grown longer than the model can read in one go.",
        );
      }
      /*
       * 401 and 403 are the two a person can actually fix, so they get their
       * own sentence instead of a status code. Everything else carries the
       * provider's own words, which are usually more specific than anything
       * this layer could invent.
       */
      /*
       * Rate limited, which is a wait rather than a fault. Providers meter by
       * tokens per minute, and a long question can exhaust a minute's budget
       * partway through its own loop — so this is not "the model is broken", it
       * is "ask again shortly", and saying the second thing is the difference
       * between a person retrying and a person concluding the feature is dead.
       *
       * `retry-after` is honoured when the provider sends one; most send
       * seconds, some send a date, and an unreadable value simply means no
       * advice rather than an error about the advice.
       */
      if (response.status === 429) {
        const advice = response.headers.get("retry-after");
        const seconds = advice && /^\d+$/u.test(advice) ? Number(advice) : undefined;

        throw new DomainError(
          "RATE_LIMITED",
          "The model is busy right now — it has hit its limit for this minute. Try again shortly.",
          seconds === undefined ? undefined : { retryAfterSeconds: seconds },
        );
      }

      /*
       * The model produced a tool call its own provider rejected.
       *
       * Groq validates the arguments the model generates and answers 400 with
       * `tool_use_failed` rather than passing them on. Observed against the
       * real endpoint: given twenty-six tools it will sometimes call
       * `search_projects` with the required `query` missing, and the whole
       * request dies — no answer, no chance for the model to correct itself,
       * because the loop never sees a reply to feed back.
       *
       * That is a bad turn, not a broken provider, and it is recoverable: the
       * loop already knows how to hand an "those arguments are not valid"
       * observation back to the model, which is exactly what happens when OUR
       * validation catches the same mistake. Reported as its own code so the
       * harness can do that instead of ending the conversation.
       */
      if (response.status === 400 && body.includes("tool_use_failed")) {
        throw new DomainError(
          "UPSTREAM_TOOL_CALL_REJECTED",
          "The model produced a tool call its provider refused.",
        );
      }

      if (response.status === 401 || response.status === 403) {
        throw new DomainError(
          "CONFIGURATION_REQUIRED",
          "The model provider rejected the API key. Check it in Settings.",
        );
      }
      throw new DomainError(
        "UPSTREAM_UNAVAILABLE",
        `The model provider returned an error (${response.status}). ${body.slice(0, 200)}`.trim(),
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new DomainError("UPSTREAM_UNAVAILABLE", "The model returned a reply Rectangle could not read.");
    }

    const choice = (payload as { choices?: Array<{ message?: Record<string, unknown> }> })
      ?.choices?.[0]?.message;
    if (!choice) {
      throw new DomainError("UPSTREAM_UNAVAILABLE", "The model returned an empty reply.");
    }

    const rawCalls = Array.isArray(choice.tool_calls) ? choice.tool_calls : [];
    const toolCalls: ProviderToolCall[] = rawCalls
      .filter(
        (call): call is ProviderToolCall =>
          typeof call === "object" &&
          call !== null &&
          typeof (call as ProviderToolCall).id === "string" &&
          typeof (call as ProviderToolCall).function?.name === "string",
      )
      .map((call) => ({
        id: call.id,
        type: "function",
        function: {
          name: call.function.name,
          // Some providers omit arguments for a no-argument tool. An empty
          // object parses; undefined does not.
          arguments: typeof call.function.arguments === "string" ? call.function.arguments : "{}",
        },
      }));

    return {
      content: typeof choice.content === "string" ? choice.content : "",
      toolCalls,
    };
  }
}

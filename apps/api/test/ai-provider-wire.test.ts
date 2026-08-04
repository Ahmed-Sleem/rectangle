/**
 * The wire format, against a real HTTP server.
 *
 * Every other test uses a fake provider, which proves the harness reasons
 * correctly and proves nothing at all about whether a real provider would
 * accept the bytes. This one stands up an actual server that validates the
 * request the way OpenAI's does, and replies the way OpenAI's does — including
 * a tool call, which is the part with the most room to be subtly wrong.
 */
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { OpenAiCompatibleProvider } from "../src/infrastructure/ai-provider.js";
import { describeToolForProvider } from "../src/application/ai-service.js";
import { aiTools, findTool } from "../src/domain/ai.js";

/** The real description the harness would send for a named tool. */
function describeTool(name: string) {
  const tool = findTool(name);
  if (!tool) throw new Error(`no such tool: ${name}`);
  return describeToolForProvider(tool);
}

let server: Server;
let baseUrl = "";
let received: any;
let reply: any = {
  choices: [{ message: { role: "assistant", content: "Two projects are running." } }],
};
let status = 200;

beforeAll(async () => {
  server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      received = { url: request.url, headers: request.headers, body: JSON.parse(body || "{}") };
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(reply));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/v1`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const request = () => ({
  baseUrl,
  model: "gpt-4o-mini",
  apiKey: "sk-wire-test",
  messages: [{ role: "system" as const, content: "S" }, { role: "user" as const, content: "how many projects" }],
  tools: [
    {
      type: "function" as const,
      function: { name: "search_projects", description: "d", parameters: { type: "object", properties: {} } },
    },
  ],
  timeoutMs: 5_000,
});

describe("the request a real provider receives", () => {
  it("posts to /chat/completions with a bearer key and the OpenAI body", async () => {
    await new OpenAiCompatibleProvider().complete(request());

    expect(received.url).toBe("/v1/chat/completions");
    expect(received.headers.authorization).toBe("Bearer sk-wire-test");
    expect(received.headers["content-type"]).toContain("application/json");
    expect(received.body.model).toBe("gpt-4o-mini");
    expect(received.body.messages).toHaveLength(2);
    // Tools are sent in the shape the API documents, not a shape of our own.
    expect(received.body.tools[0]).toMatchObject({
      type: "function",
      function: { name: "search_projects" },
    });
  });

  it("does not double the path when the endpoint already names it", async () => {
    await new OpenAiCompatibleProvider().complete({
      ...request(),
      baseUrl: `${baseUrl}/chat/completions`,
    });
    expect(received.url).toBe("/v1/chat/completions");
  });

  it("omits tools entirely rather than sending an empty array", async () => {
    // Some providers reject `tools: []`, and the final cycle sends none.
    await new OpenAiCompatibleProvider().complete({ ...request(), tools: [] });
    expect(received.body).not.toHaveProperty("tools");
  });

  it("reads a real tool call out of a real response", async () => {
    reply = {
      choices: [
        {
          message: {
            role: "assistant",
            content: "",
            tool_calls: [
              {
                id: "call_abc123",
                type: "function",
                function: { name: "search_projects", arguments: '{"query":"Nile"}' },
              },
            ],
          },
        },
      ],
    };

    const result = await new OpenAiCompatibleProvider().complete(request());

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]?.function.name).toBe("search_projects");
    expect(JSON.parse(result.toolCalls[0]?.function.arguments ?? "{}")).toEqual({ query: "Nile" });
  });

  it("turns a rejected key into something a person can act on", async () => {
    status = 401;
    reply = { error: { message: "Incorrect API key provided: sk-wire-test" } };

    await expect(new OpenAiCompatibleProvider().complete(request())).rejects.toMatchObject({
      code: "CONFIGURATION_REQUIRED",
    });

    status = 200;
  });

  /*
   * A conversation that outgrew the model is not the provider being broken, and
   * the person has a real remedy the other failures do not offer, so it must
   * arrive as its own code.
   *
   * Both bodies below were copied from real responses rather than imagined.
   * OpenAI and Azure set code "context_length_exceeded"; Groq, measured against
   * the live endpoint, sets NO code at all and returns only the sentence. A
   * detector keyed on the code alone would therefore have missed every Groq
   * user, which is most of the reason this is asserted twice.
   */
  it.each([
    [
      "openai",
      {
        error: {
          message: "This model's maximum context length is 8192 tokens. However, your messages resulted in 9000 tokens.",
          type: "invalid_request_error",
          code: "context_length_exceeded",
        },
      },
    ],
    [
      "groq",
      {
        error: {
          message: "Please reduce the length of the messages or completion.",
          type: "invalid_request_error",
          param: "messages",
        },
      },
    ],
  ])("recognises %s telling it the conversation is too long", async (_name, body) => {
    status = 400;
    reply = body;

    await expect(new OpenAiCompatibleProvider().complete(request())).rejects.toMatchObject({
      code: "CONTEXT_TOO_LONG",
    });
  });

  /* A different 400 must NOT be mistaken for one, or the panel offers the wrong way out. */
  it("does not mistake an ordinary bad request for an overlong conversation", async () => {
    status = 400;
    reply = { error: { message: "unknown model", type: "invalid_request_error" } };

    await expect(new OpenAiCompatibleProvider().complete(request())).rejects.toMatchObject({
      code: "UPSTREAM_UNAVAILABLE",
    });
  });

  /*
   * Groq validates the arguments the model itself generated and answers 400
   * with `tool_use_failed` rather than passing them on. Observed against the
   * live endpoint: with twenty-six tools it will sometimes call
   * `search_projects` with the required `query` missing. Reported as its own
   * code so the loop can feed the correction back instead of ending the
   * conversation, which is what a bad turn deserves and a broken provider does
   * not.
   */
  it("tells a refused tool call apart from a broken provider", async () => {
    status = 400;
    reply = {
      error: {
        message: "tool call validation failed: parameters for tool search_projects did not match schema",
        type: "invalid_request_error",
        code: "tool_use_failed",
      },
    };

    await expect(new OpenAiCompatibleProvider().complete(request())).rejects.toMatchObject({
      code: "UPSTREAM_TOOL_CALL_REJECTED",
    });
  });

  /*
   * A rate limit is a wait, not a fault. Providers meter by tokens per minute
   * and a long question can exhaust a minute inside its own loop, so saying
   * "try again shortly" is the difference between a person retrying and a
   * person concluding the feature is dead.
   */
  it("reports a rate limit as something to wait out", async () => {
    status = 429;
    reply = { error: { message: "Rate limit reached for model ... on tokens per minute (TPM)" } };

    await expect(new OpenAiCompatibleProvider().complete(request())).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });

  it("never lets the key reach an error message", async () => {
    status = 500;
    // A provider echoing the key back is the case this defends against.
    reply = { error: { message: "failed with Authorization: Bearer sk-wire-test" } };

    const failure = await new OpenAiCompatibleProvider()
      .complete(request())
      .then(() => null)
      .catch((error: Error) => error);

    expect(failure?.message).not.toContain("sk-wire-test");
    expect(failure?.message).toContain("[redacted]");

    status = 200;
  });
});

describe("the tool schema a provider is given", () => {
  /*
   * The suite above deliberately leaves a tool-call reply and an error status
   * behind. Resetting here rather than relying on order keeps each block
   * independent — a test that only passes when its neighbours ran first is a
   * test of the file, not of the code.
   */
  beforeEach(() => {
    status = 200;
    reply = { choices: [{ message: { role: "assistant", content: "ok" } }] };
  });

  /*
   * These were all wrong until session 50. The schema was written by hand and
   * declared every parameter `type: "string"`, so a model was told a status
   * enum was free text and a 1-5 score was a word. It guessed, the guesses
   * failed Zod on the way back, and the model saw an unexplained refusal.
   */
  it("describes an enum as an enum, not as free text", async () => {
    await new OpenAiCompatibleProvider().complete({
      ...request(),
      tools: [describeTool("update_task")],
    });

    const properties = received.body.tools[0].function.parameters.properties;
    expect(properties.status.enum).toContain("done");
    expect(properties.status.type).toBe("string");
  });

  it("describes a bounded integer as an integer with its bounds", async () => {
    await new OpenAiCompatibleProvider().complete({
      ...request(),
      tools: [describeTool("create_risk")],
    });

    const properties = received.body.tools[0].function.parameters.properties;
    expect(properties.probability.type).toBe("integer");
    expect(properties.probability.minimum).toBe(1);
    expect(properties.probability.maximum).toBe(5);
  });

  /*
   * The update tools wrap their object in `.refine()` to require at least one
   * field. The hand-written converter read `.shape` off the wrapper and found
   * nothing, so those tools were advertised as taking no arguments at all.
   */
  it("sees through a refined schema to the fields inside it", async () => {
    await new OpenAiCompatibleProvider().complete({
      ...request(),
      tools: [describeTool("update_risk")],
    });

    const parameters = received.body.tools[0].function.parameters;
    expect(Object.keys(parameters.properties)).toContain("riskId");
    expect(Object.keys(parameters.properties)).toContain("mitigation");
    expect(parameters.required).toEqual(["riskId"]);
  });

  it("gives a no-argument tool an empty properties object, not nothing", async () => {
    await new OpenAiCompatibleProvider().complete({
      ...request(),
      tools: [describeTool("whoami")],
    });

    const parameters = received.body.tools[0].function.parameters;
    expect(parameters.type).toBe("object");
    expect(parameters.properties).toEqual({});
  });

  /* Some providers reject unknown top-level keys in a parameters object. */
  it("does not send a $schema key", async () => {
    await new OpenAiCompatibleProvider().complete({
      ...request(),
      tools: [describeTool("create_task")],
    });

    expect(received.body.tools[0].function.parameters).not.toHaveProperty("$schema");
  });

  /*
   * The fault this guards broke the assistant completely for every person, and
   * it is worth stating precisely because the shape of the failure is what made
   * it hard to see. Zod emits a `pattern` for `z.email()` and `z.uuid()` built
   * from negative lookahead. JSON Schema requires `pattern` to be ECMA-262, but
   * most providers validate with RE2 — Go and Rust both — and RE2 refuses
   * lookahead by design, since forbidding it is what buys linear-time matching.
   *
   * Groq therefore rejected the whole request with 400 before the model ran, so
   * a single unusable regex inside `create_user` made every question from every
   * person fail, whatever it was about. Asserted across the entire registry
   * rather than on one tool, because the blast radius is the entire registry:
   * any tool that grows an email or a uuid field would put it back.
   */
  it("sends no regex pattern in any tool, because providers validate with RE2", () => {
    const patternsIn = (node: unknown, path: string): string[] => {
      if (Array.isArray(node)) return node.flatMap((entry, index) => patternsIn(entry, `${path}[${index}]`));
      if (node === null || typeof node !== "object") return [];

      return Object.entries(node).flatMap(([key, value]) =>
        key === "pattern" ? [`${path}.pattern`] : patternsIn(value, `${path}.${key}`),
      );
    };

    const offenders = aiTools.flatMap((tool) =>
      patternsIn(describeToolForProvider(tool).function.parameters, tool.name),
    );

    expect(offenders).toEqual([]);
  });

  it("sends the reply ceiling when one is configured, and omits it otherwise", async () => {
    await new OpenAiCompatibleProvider().complete({ ...request(), maxOutputTokens: 1500 });
    expect(received.body.max_tokens).toBe(1500);

    await new OpenAiCompatibleProvider().complete(request());
    // Omitted rather than defaulted: every provider has its own sensible
    // ceiling and inventing one here would cut answers short.
    expect(received.body).not.toHaveProperty("max_tokens");
  });
});

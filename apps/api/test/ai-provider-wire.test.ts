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
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OpenAiCompatibleProvider } from "../src/infrastructure/ai-provider.js";

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

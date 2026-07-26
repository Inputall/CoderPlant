import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

export interface MockServer {
  origin: string;
  close: () => Promise<void>;
}

export async function startMockServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
): Promise<MockServer> {
  const server = createServer((request, response) => {
    void Promise.resolve(handler(request, response)).catch((error: unknown) => {
      response.statusCode = 500;
      response.end(error instanceof Error ? error.message : "mock error");
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Mock server did not expose a TCP address.");
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    })
  };
}

export async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

export function chatResponse(includeUsage = true): Record<string, unknown> {
  return {
    id: "chatcmpl-test",
    object: "chat.completion",
    created: 1_700_000_000,
    model: "test-model",
    choices: [{
      index: 0,
      message: { role: "assistant", content: "OK" },
      finish_reason: "stop"
    }],
    ...(includeUsage ? { usage: { prompt_tokens: 8, completion_tokens: 1, total_tokens: 9 } } : {})
  };
}

import { afterEach, describe, expect, it } from "vitest";
import { runDiagnostic } from "../src/core/runner.js";
import type { DiagnosticConfig, DiagnosticReport, ProviderId } from "../src/core/types.js";
import { readJsonBody, startMockServer, type MockServer } from "./helpers/mock-server.js";

const servers: MockServer[] = [];
const apiKey = "provider-test-secret";

async function server(handler: Parameters<typeof startMockServer>[0]): Promise<MockServer> {
  const instance = await startMockServer(handler);
  servers.push(instance);
  return instance;
}

function config(origin: string, provider: ProviderId, overrides: Partial<DiagnosticConfig> = {}): DiagnosticConfig {
  return {
    provider,
    endpoint: origin,
    model: "test/model",
    apiKey,
    timeoutMs: 1_000,
    testStream: true,
    ...overrides
  };
}

function result(report: DiagnosticReport, id: string) {
  return report.results.find((item) => item.id === id);
}

function expectSuccess(report: DiagnosticReport): void {
  expect(result(report, "chat.schema")?.status).toBe("pass");
  expect(result(report, "chat.content")?.status).toBe("pass");
  expect(result(report, "stream.protocol")?.status).toBe("pass");
  expect(result(report, "stream.content")?.status).toBe("pass");
  expect(result(report, "stream.termination")?.status).toBe("pass");
  expect(JSON.stringify(report)).not.toContain(apiKey);
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((instance) => instance.close()));
});

describe("provider adapters", () => {
  it("diagnoses OpenAI Responses API JSON and typed SSE events", async () => {
    const mock = await server(async (request, response) => {
      expect(request.url).toBe("/v1/responses");
      expect(request.headers.authorization).toBe(`Bearer ${apiKey}`);
      const body = await readJsonBody(request);
      expect(body.max_output_tokens).toBe(5);
      if (body.stream === true) {
        response.writeHead(200, { "Content-Type": "text/event-stream" });
        response.end([
          "event: response.created\ndata: {\"type\":\"response.created\"}\n\n",
          "event: response.output_text.delta\ndata: {\"type\":\"response.output_text.delta\",\"delta\":\"OK\"}\n\n",
          "event: response.completed\ndata: {\"type\":\"response.completed\"}\n\n"
        ].join(""));
        return;
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        id: "resp_test",
        object: "response",
        model: "test/model",
        output: [{ type: "message", content: [{ type: "output_text", text: "OK" }] }],
        usage: { input_tokens: 8, output_tokens: 1 }
      }));
    });

    const report = await runDiagnostic(config(mock.origin, "openai-responses"));
    expect(report.provider).toBe("openai-responses");
    expect(report.endpoint).toBe(`${mock.origin}/v1/responses`);
    expectSuccess(report);
  });

  it("diagnoses Anthropic Messages JSON and SSE events", async () => {
    const mock = await server(async (request, response) => {
      expect(request.url).toBe("/v1/messages");
      expect(request.headers["x-api-key"]).toBe(apiKey);
      expect(request.headers["anthropic-version"]).toBe("2023-06-01");
      const body = await readJsonBody(request);
      expect(body.max_tokens).toBe(5);
      if (body.stream === true) {
        response.writeHead(200, { "Content-Type": "text/event-stream" });
        response.end([
          "event: message_start\ndata: {\"type\":\"message_start\"}\n\n",
          "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"OK\"}}\n\n",
          "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"
        ].join(""));
        return;
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "test/model",
        content: [{ type: "text", text: "OK" }],
        usage: { input_tokens: 8, output_tokens: 1 }
      }));
    });

    const report = await runDiagnostic(config(mock.origin, "anthropic", { apiVersion: "2023-06-01" }));
    expect(report.endpoint).toBe(`${mock.origin}/v1/messages`);
    expectSuccess(report);
  });

  it("diagnoses Gemini generateContent and streamGenerateContent", async () => {
    const mock = await server(async (request, response) => {
      expect(request.headers["x-goog-api-key"]).toBe(apiKey);
      const body = await readJsonBody(request);
      expect(body.generationConfig).toEqual({ maxOutputTokens: 5 });
      if (request.url?.includes(":streamGenerateContent")) {
        expect(request.url).toContain("alt=sse");
        response.writeHead(200, { "Content-Type": "text/event-stream" });
        response.end("data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"OK\"}]},\"finishReason\":\"STOP\"}]}\n\n");
        return;
      }
      expect(request.url).toContain("/v1beta/models/test%2Fmodel:generateContent");
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        candidates: [{ content: { parts: [{ text: "OK" }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 1 }
      }));
    });

    const report = await runDiagnostic(config(mock.origin, "gemini"));
    expect(report.endpoint).toContain("/v1beta/models/test%2Fmodel:generateContent");
    expectSuccess(report);
  });

  it("diagnoses Azure OpenAI deployment paths and api-key authentication", async () => {
    const mock = await server(async (request, response) => {
      expect(request.headers["api-key"]).toBe(apiKey);
      expect(request.url).toContain("/openai/deployments/test%2Fmodel/chat/completions");
      expect(request.url).toContain("api-version=2024-10-21");
      const body = await readJsonBody(request);
      if (body.stream === true) {
        response.writeHead(200, { "Content-Type": "text/event-stream" });
        response.end([
          "data: {\"choices\":[{\"delta\":{\"content\":\"OK\"},\"finish_reason\":null}]}\n\n",
          "data: [DONE]\n\n"
        ].join(""));
        return;
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        id: "chatcmpl-azure",
        object: "chat.completion",
        created: 1_700_000_000,
        model: "test/model",
        choices: [{ message: { role: "assistant", content: "OK" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 8, completion_tokens: 1, total_tokens: 9 }
      }));
    });

    const report = await runDiagnostic(config(mock.origin, "azure-openai", { apiVersion: "2024-10-21" }));
    expectSuccess(report);
  });
});

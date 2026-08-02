import { afterEach, describe, expect, it } from "vitest";
import { runDiagnostic } from "../src/core/runner.js";
import { DiagnosticCancelledError } from "../src/core/http.js";
import type { DiagnosticConfig, DiagnosticReport } from "../src/core/types.js";
import { chatResponse, readJsonBody, startMockServer, type MockServer } from "./helpers/mock-server.js";

const servers: MockServer[] = [];
const apiKey = "sk-test-super-secret-value";

function config(origin: string, overrides: Partial<DiagnosticConfig> = {}): DiagnosticConfig {
  return {
    endpoint: origin,
    model: "test-model",
    apiKey,
    timeoutMs: 1_000,
    testStream: false,
    ...overrides
  };
}

async function server(handler: Parameters<typeof startMockServer>[0]): Promise<MockServer> {
  const instance = await startMockServer(handler);
  servers.push(instance);
  return instance;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((instance) => instance.close()));
});

function result(report: DiagnosticReport, id: string) {
  return report.results.find((item) => item.id === id);
}

describe("runDiagnostic integration", () => {
  it("passes standard non-streaming and fragmented SSE responses", async () => {
    const mock = await server(async (request, response) => {
      expect(request.headers.authorization).toBe(`Bearer ${apiKey}`);
      const body = await readJsonBody(request);
      expect(body.max_tokens).toBe(5);
      if (body.stream === true) {
        response.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8" });
        const payload = [
          "data: {\"choices\":[{\"delta\":{\"role\":\"assistant\"},\"finish_reason\":null}]}\r\n\r\n",
          "data: {\"choices\":[{\"delta\":{\"content\":\"OK\"},\"finish_reason\":null}]}\r\n\r\n",
          "data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}\r\n\r\n",
          "data: [DONE]\r\n\r\n"
        ].join("");
        for (const character of payload) response.write(character);
        response.end();
        return;
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(chatResponse()));
    });

    const report = await runDiagnostic(config(mock.origin, { testStream: true }));
    expect(report.summary.status).toBe("pass");
    expect(result(report, "chat.schema")?.status).toBe("pass");
    expect(result(report, "stream.protocol")?.status).toBe("pass");
    expect(result(report, "stream.termination")?.status).toBe("pass");
    expect(result(report, "stream.timing")?.details).toHaveProperty("ttftMs");
    expect(JSON.stringify(report)).not.toContain(apiKey);
  });

  it("warns when optional usage is absent and streaming is skipped", async () => {
    const mock = await server((_request, response) => {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(chatResponse(false)));
    });
    const report = await runDiagnostic(config(mock.origin));
    expect(report.summary.status).toBe("warn");
    expect(result(report, "chat.usage")?.status).toBe("warn");
    expect(result(report, "stream.request")?.status).toBe("skip");
  });

  it("rejects HTML and invalid JSON responses", async () => {
    const html = await server((_request, response) => {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end("<!doctype html><html></html>");
    });
    const htmlReport = await runDiagnostic(config(html.origin));
    expect(result(htmlReport, "chat.content_type")?.status).toBe("fail");

    const invalid = await server((_request, response) => {
      response.writeHead(200, { "Content-Type": "text/plain" });
      response.end("{invalid");
    });
    const invalidReport = await runDiagnostic(config(invalid.origin));
    expect(result(invalidReport, "chat.content_type")?.status).toBe("warn");
    expect(result(invalidReport, "chat.schema")?.message).toContain("not valid JSON");
  });

  it.each([400, 401, 403, 404, 408, 429, 500])("classifies HTTP %s", async (status) => {
    const mock = await server((_request, response) => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: `failed ${apiKey}` }));
    });
    const report = await runDiagnostic(config(mock.origin));
    expect(result(report, "chat.http")?.status).toBe("fail");
    expect(JSON.stringify(report)).not.toContain(apiKey);
  });

  it("times out a slow response", async () => {
    const mock = await server((_request, response) => {
      setTimeout(() => response.end(JSON.stringify(chatResponse())), 100);
    });
    const report = await runDiagnostic(config(mock.origin, { timeoutMs: 20 }));
    expect(result(report, "chat.request")?.message).toContain("timed out");
  });

  it("cancels an active diagnostic through an external signal", async () => {
    const mock = await server((_request, response) => {
      setTimeout(() => response.end(JSON.stringify(chatResponse())), 100);
    });
    const controller = new AbortController();
    const diagnostic = runDiagnostic(config(mock.origin, { signal: controller.signal }));
    setTimeout(() => controller.abort(), 10);
    await expect(diagnostic).rejects.toBeInstanceOf(DiagnosticCancelledError);
  });

  it("blocks a cross-origin redirect before forwarding authorization", async () => {
    let targetAuthorization: string | undefined;
    const target = await server((request, response) => {
      targetAuthorization = request.headers.authorization;
      response.end(JSON.stringify(chatResponse()));
    });
    const source = await server((_request, response) => {
      response.writeHead(307, { Location: `${target.origin}/v1/chat/completions` });
      response.end();
    });

    const report = await runDiagnostic(config(source.origin));
    expect(result(report, "chat.request")?.message).toContain("cross-origin");
    expect(targetAuthorization).toBeUndefined();
  });

  it("follows a same-origin 307 redirect", async () => {
    const mock = await server(async (request, response) => {
      if (request.url?.startsWith("/v1/chat/completions")) {
        response.writeHead(307, { Location: "/actual" });
        response.end();
        return;
      }
      await readJsonBody(request);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(chatResponse()));
    });
    const report = await runDiagnostic(config(mock.origin));
    expect(result(report, "chat.http")?.status).toBe("pass");
  });

  it("fails streams with invalid chunks, no text, and no DONE marker", async () => {
    const mock = await server(async (request, response) => {
      const body = await readJsonBody(request);
      if (body.stream === true) {
        response.writeHead(200, { "Content-Type": "text/event-stream" });
        response.end("data: not-json\n\n");
        return;
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(chatResponse()));
    });

    const report = await runDiagnostic(config(mock.origin, { testStream: true }));
    expect(result(report, "stream.protocol")?.status).toBe("fail");
    expect(result(report, "stream.content")?.status).toBe("fail");
    expect(result(report, "stream.termination")?.status).toBe("fail");
    expect(result(report, "stream.timing")?.status).toBe("warn");
  });

  it("reports endpoint validation failures without making a request", async () => {
    const report = await runDiagnostic(config("not-a-url"));
    expect(report.summary.status).toBe("fail");
    expect(result(report, "url.normalization")?.status).toBe("fail");
  });
});

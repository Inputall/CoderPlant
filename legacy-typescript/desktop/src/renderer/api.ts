import type { DiagnosticReport } from "../../../dist/index.js";
import type {
  DesktopApi,
  DesktopDiagnosticInput,
  DiagnosticRunResponse,
  ExportRequest,
  ExportResponse
} from "../shared/contracts.js";

let mockCancelled = false;

function sampleReport(input: DesktopDiagnosticInput): DiagnosticReport {
  const now = new Date().toISOString();
  return {
    version: "0.1.0",
    provider: input.provider,
    endpoint: input.baseUrl,
    model: input.model,
    startedAt: now,
    finishedAt: now,
    durationMs: 1842.6,
    summary: { status: "warn", pass: 8, fail: 0, warn: 1, skip: input.testStream ? 0 : 1 },
    results: [
      { id: "url.normalization", name: "API endpoint", status: "pass", message: "The API endpoint was normalized successfully." },
      { id: "chat.http", name: "Non-streaming HTTP request", status: "pass", durationMs: 614.2, message: "Received HTTP 200.", details: { headerLatencyMs: 614.2 } },
      { id: "chat.content_type", name: "Non-streaming content type", status: "pass", message: "Received application/json." },
      { id: "chat.schema", name: "Chat Completions response", status: "pass", durationMs: 812.4, message: "The response contains the required Chat Completions fields.", details: { totalDurationMs: 812.4 } },
      { id: "chat.content", name: "Model text response", status: "pass", message: "The model followed the minimal text instruction." },
      { id: "chat.usage", name: "Token usage metadata", status: "warn", message: "The response omits optional usage metadata.", suggestion: "Usage is optional for V1 compatibility." },
      ...(input.testStream ? [
        { id: "stream.http", name: "Streaming HTTP request", status: "pass" as const, durationMs: 704.8, message: "Received HTTP 200." },
        { id: "stream.protocol", name: "SSE protocol", status: "pass" as const, message: "Parsed 4 SSE data events and 3 valid delta chunks." },
        { id: "stream.timing", name: "Streaming latency", status: "pass" as const, durationMs: 1021.2, message: "Headers arrived in 704.8 ms; TTFT was 841.1 ms; total was 1021.2 ms.", details: { headerLatencyMs: 704.8, ttftMs: 841.1, totalDurationMs: 1021.2 } }
      ] : [
        { id: "stream.request", name: "Streaming request", status: "skip" as const, message: "Streaming diagnostics were not requested." }
      ])
    ]
  };
}

const browserPreviewApi: DesktopApi = {
  async runDiagnostic(input: DesktopDiagnosticInput): Promise<DiagnosticRunResponse> {
    mockCancelled = false;
    await new Promise((resolve) => setTimeout(resolve, 700));
    if (mockCancelled) return { ok: false, cancelled: true, error: "Diagnostic run was cancelled." };
    return { ok: true, report: sampleReport(input) };
  },
  async cancelDiagnostic(): Promise<boolean> {
    mockCancelled = true;
    return true;
  },
  async exportReport(request: ExportRequest): Promise<ExportResponse> {
    const extension = request.format === "json" ? "json" : "md";
    const blob = new Blob([request.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `llm-api-doctor-report.${extension}`;
    anchor.click();
    URL.revokeObjectURL(url);
    return { ok: true, path: anchor.download };
  }
};

const unavailableApi: DesktopApi = {
  async runDiagnostic(): Promise<DiagnosticRunResponse> {
    return {
      ok: false,
      cancelled: false,
      error: "Desktop bridge is unavailable. Restart the application."
    };
  },
  async cancelDiagnostic(): Promise<boolean> {
    return false;
  },
  async exportReport(): Promise<ExportResponse> {
    return {
      ok: false,
      cancelled: false,
      error: "Desktop bridge is unavailable. Restart the application."
    };
  }
};

export function getDesktopApi(): DesktopApi {
  if (window.desktopApi) return window.desktopApi;
  const rendererPreview = import.meta.env.DEV && !navigator.userAgent.includes("Electron");
  return rendererPreview ? browserPreviewApi : unavailableApi;
}

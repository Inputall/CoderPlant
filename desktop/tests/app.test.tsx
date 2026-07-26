import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DiagnosticReport } from "../../dist/index.js";
import type { DesktopApi } from "../src/shared/contracts.js";
import { App } from "../src/renderer/App.js";

const report: DiagnosticReport = {
  version: "0.1.0",
  provider: "openai-compatible",
  endpoint: "https://example.com/v1/chat/completions",
  model: "test-model",
  startedAt: "2026-01-01T00:00:00.000Z",
  finishedAt: "2026-01-01T00:00:01.000Z",
  durationMs: 1_000,
  summary: { status: "pass", pass: 2, warn: 0, fail: 0, skip: 0 },
  results: [
    { id: "chat.http", name: "Non-streaming HTTP request", status: "pass", durationMs: 300, message: "Received HTTP 200." },
    { id: "stream.timing", name: "Streaming latency", status: "pass", durationMs: 700, message: "TTFT was 500 ms.", details: { ttftMs: 500 } }
  ]
};

describe("desktop App", () => {
  it("runs a diagnostic, renders results, and never persists the key", async () => {
    const runDiagnostic = vi.fn().mockResolvedValue({ ok: true, report });
    const exportReport = vi.fn().mockResolvedValue({ ok: true, path: "report.json" });
    const api: DesktopApi = {
      runDiagnostic,
      cancelDiagnostic: vi.fn().mockResolvedValue(true),
      exportReport
    };
    window.desktopApi = api;

    render(<App />);
    const streaming = screen.getByRole("checkbox", { name: "Streaming" });
    expect(streaming).not.toBeChecked();
    fireEvent.click(streaming);
    fireEvent.change(screen.getByPlaceholderText("https://api.example.com/v1"), { target: { value: "https://example.com" } });
    fireEvent.change(screen.getByPlaceholderText("model-id"), { target: { value: "test-model" } });
    fireEvent.change(screen.getByPlaceholderText("Enter API key"), { target: { value: "sk-private-test-key" } });
    fireEvent.click(screen.getByRole("button", { name: "Run diagnostic" }));

    await screen.findByText("Non-streaming HTTP request");
    expect(runDiagnostic).toHaveBeenCalledWith(expect.objectContaining({ provider: "openai-compatible", apiKey: "sk-private-test-key", testStream: true }));
    expect(localStorage.getItem("doctor.desktop.settings")).not.toContain("sk-private-test-key");
    expect(screen.getByText("500 ms")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Report / 报告" }));
    expect(screen.getByText(/chat\.http/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "JSON" }));
    await waitFor(() => expect(exportReport).toHaveBeenCalledWith(expect.objectContaining({ format: "json" })));
  });

  it("validates required fields before invoking the bridge", () => {
    const runDiagnostic = vi.fn();
    window.desktopApi = {
      runDiagnostic,
      cancelDiagnostic: vi.fn(),
      exportReport: vi.fn()
    } as unknown as DesktopApi;
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Run diagnostic" }));
    expect(screen.getByRole("alert")).toHaveTextContent("required");
    expect(runDiagnostic).not.toHaveBeenCalled();
  });

  it("applies provider defaults and submits provider-specific settings", async () => {
    const runDiagnostic = vi.fn().mockResolvedValue({ ok: true, report: { ...report, provider: "anthropic" } });
    window.desktopApi = {
      runDiagnostic,
      cancelDiagnostic: vi.fn(),
      exportReport: vi.fn()
    } as unknown as DesktopApi;
    render(<App />);

    fireEvent.change(screen.getByLabelText("Provider protocol"), { target: { value: "anthropic" } });
    expect(screen.getByPlaceholderText("https://api.example.com/v1")).toHaveValue("https://api.anthropic.com");
    expect(screen.getByPlaceholderText("2023-06-01")).toHaveValue("2023-06-01");
    fireEvent.change(screen.getByPlaceholderText("model-id"), { target: { value: "claude-test" } });
    fireEvent.change(screen.getByPlaceholderText("Enter API key"), { target: { value: "anthropic-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Run diagnostic" }));

    await waitFor(() => expect(runDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com",
      apiVersion: "2023-06-01"
    })));
  });
});

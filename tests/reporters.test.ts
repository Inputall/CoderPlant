import { describe, expect, it } from "vitest";
import type { DiagnosticReport } from "../src/core/types.js";
import { renderReport } from "../src/reporters/index.js";
import { renderJsonReport } from "../src/reporters/json.js";
import { renderMarkdownReport } from "../src/reporters/markdown.js";
import { renderTerminalReport } from "../src/reporters/terminal.js";

const report: DiagnosticReport = {
  version: "0.1.0",
  provider: "openai-compatible",
  endpoint: "https://example.com/v1/chat/completions",
  model: "model",
  startedAt: "2026-01-01T00:00:00.000Z",
  finishedAt: "2026-01-01T00:00:00.010Z",
  durationMs: 10,
  summary: { status: "fail", pass: 1, warn: 1, fail: 1, skip: 1 },
  results: [
    { id: "a", name: "HTTP", status: "pass", durationMs: 5, message: "Works" },
    { id: "b", name: "Usage", status: "warn", message: "Missing | optional\nfield", suggestion: "Ignore" },
    { id: "c", name: "Schema", status: "fail", message: "Broken" },
    { id: "d", name: "Stream", status: "skip", message: "Skipped" }
  ]
};

describe("reporters", () => {
  it("renders parseable JSON", () => {
    expect(JSON.parse(renderJsonReport(report))).toEqual(report);
    expect(renderReport(report, "json")).toBe(renderJsonReport(report));
  });

  it("renders escaped Markdown", () => {
    const markdown = renderMarkdownReport(report);
    expect(markdown).toContain("# LLM API Doctor Report");
    expect(markdown).toContain("Missing \\| optional field");
    expect(renderReport(report, "markdown")).toBe(markdown);
  });

  it("renders all terminal statuses and suggestions", () => {
    const terminal = renderTerminalReport(report);
    expect(terminal).toContain("Overall:");
    expect(terminal).toContain("Suggestion: Ignore");
    expect(terminal).toContain("1 passed, 1 warned, 1 failed, 1 skipped");
    expect(renderReport(report, "terminal")).toBe(terminal);
  });
});

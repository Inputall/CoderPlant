import { describe, expect, it } from "vitest";
import type { DiagnosticReport } from "../../dist/index.js";
import { formatDuration, reportToJson, reportToMarkdown } from "../src/renderer/report-format.js";

const report: DiagnosticReport = {
  version: "0.1.0",
  provider: "openai-compatible",
  endpoint: "https://example.com/v1/chat/completions",
  model: "model",
  startedAt: "2026-01-01T00:00:00.000Z",
  finishedAt: "2026-01-01T00:00:01.500Z",
  durationMs: 1_500,
  summary: { status: "warn", pass: 1, warn: 1, fail: 0, skip: 0 },
  results: [
    { id: "http", name: "HTTP", status: "pass", durationMs: 250, message: "OK" },
    { id: "usage", name: "Usage", status: "warn", message: "Missing | optional\nvalue" }
  ]
};

describe("desktop report formatting", () => {
  it("produces parseable JSON", () => {
    expect(JSON.parse(reportToJson(report))).toEqual(report);
  });

  it("escapes Markdown table content", () => {
    const markdown = reportToMarkdown(report);
    expect(markdown).toContain("Missing \\| optional value");
    expect(markdown).toContain("**WARN**");
  });

  it("formats millisecond and second durations", () => {
    expect(formatDuration(undefined)).toBe("--");
    expect(formatDuration(420)).toBe("420 ms");
    expect(formatDuration(1_500)).toBe("1.50 s");
  });
});

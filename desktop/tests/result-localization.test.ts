import { describe, expect, it } from "vitest";
import { localizeResult } from "../src/renderer/result-localization.js";

describe("desktop result localization", () => {
  it("provides Chinese labels and messages for standard checks", () => {
    const localized = localizeResult({
      id: "stream.termination",
      name: "Streaming termination",
      status: "pass",
      message: "The stream ended with [DONE].",
      suggestion: "Ensure the SSE stream emits data: [DONE] before closing."
    });
    expect(localized.nameZh).toBe("流式结束标记");
    expect(localized.messageZh).toContain("提供商协议");
    expect(localized.suggestionZh).toContain("SSE");
  });

  it("handles dynamic HTTP messages and unknown checks", () => {
    expect(localizeResult({ id: "chat.http", name: "HTTP", status: "pass", message: "Received HTTP 200." }).messageZh)
      .toBe("收到 HTTP 200。");
    expect(localizeResult({ id: "custom", name: "Custom", status: "warn", message: "Provider-specific detail." }).messageZh)
      .toContain("详细信息");
  });
});

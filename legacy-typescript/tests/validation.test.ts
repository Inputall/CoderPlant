import { describe, expect, it } from "vitest";
import { validateChatResponse } from "../src/validation/chat-response.js";
import { validateStreamChunk } from "../src/validation/stream-chunk.js";
import { chatResponse } from "./helpers/mock-server.js";

describe("response validation", () => {
  it("accepts a standard chat response", () => {
    expect(validateChatResponse(chatResponse())).toEqual({ valid: true, content: "OK", hasUsage: true });
    expect(validateChatResponse(chatResponse(false))).toEqual({ valid: true, content: "OK", hasUsage: false });
  });

  it("reports paths for invalid chat responses", () => {
    const result = validateChatResponse({ choices: [] });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues.join(" ")).toContain("id");
  });

  it("validates stream deltas and finish reasons", () => {
    expect(validateStreamChunk({ choices: [{ delta: { content: "O" }, finish_reason: null }] }))
      .toEqual({ valid: true, content: "O" });
    expect(validateStreamChunk({ choices: [{ delta: {}, finish_reason: "stop" }] }))
      .toEqual({ valid: true, finished: true });
    const invalid = validateStreamChunk({ choices: [] });
    expect(invalid.valid).toBe(false);
    expect(invalid.issues?.[0]).toContain("choices");
  });
});

import { describe, expect, it } from "vitest";
import { EndpointError, normalizeEndpoint } from "../src/url/normalize.js";

describe("normalizeEndpoint", () => {
  it.each([
    ["https://example.com", "https://example.com/v1/chat/completions"],
    ["https://example.com/v1", "https://example.com/v1/chat/completions"],
    ["https://example.com/v1/chat/completions", "https://example.com/v1/chat/completions"],
    ["https://example.com/proxy", "https://example.com/proxy/v1/chat/completions"],
    ["https://example.com/chat/completions", "https://example.com/v1/chat/completions"]
  ])("normalizes %s", (input, expected) => {
    expect(normalizeEndpoint(input).endpoint).toBe(expected);
  });

  it("removes known duplicate path segments and preserves the query", () => {
    const result = normalizeEndpoint("https://example.com/v1/v1/chat/completions/?api-version=1#fragment");
    expect(result.endpoint).toBe("https://example.com/v1/chat/completions?api-version=1");
    expect(result.warnings).toHaveLength(1);
    expect(normalizeEndpoint("https://example.com/chat/completions/chat/completions").endpoint)
      .toBe("https://example.com/v1/chat/completions");
  });

  it.each([
    ["", "required"],
    ["not a url", "absolute URL"],
    ["ftp://example.com", "HTTP or HTTPS"],
    ["https://user:pass@example.com", "Credentials"]
  ])("rejects unsafe input %s", (input, message) => {
    expect(() => normalizeEndpoint(input)).toThrowError(EndpointError);
    expect(() => normalizeEndpoint(input)).toThrow(message);
  });
});

import { describe, expect, it } from "vitest";
import { maskSecret, redactText, redactUrl, redactValue } from "../src/security/redact.js";

describe("redaction", () => {
  it("redacts explicit and OpenAI-shaped secrets", () => {
    expect(redactText("Bearer custom-secret sk-abcdefgh", ["custom-secret"]))
      .toBe("Bearer sk-**** sk-****");
    expect(maskSecret()).toBe("sk-****");
  });

  it("redacts URL credentials and sensitive query values", () => {
    const output = redactUrl("https://user:pass@example.com/v1?api_key=secret&api-version=2");
    expect(output).toContain("api_key=sk-****");
    expect(output).toContain("api-version=2");
    expect(output).not.toContain("user");
    expect(redactUrl("not-url secret", ["secret"])).toBe("not-url sk-****");
  });

  it("recursively redacts sensitive fields", () => {
    expect(redactValue({ authorization: "x", nested: ["secret", { token: "y" }] }, ["secret"]))
      .toEqual({ authorization: "sk-****", nested: ["sk-****", { token: "sk-****" }] });
    expect(redactValue(42)).toBe(42);
  });
});

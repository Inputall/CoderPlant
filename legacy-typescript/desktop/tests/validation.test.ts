import { describe, expect, it } from "vitest";
import { DesktopInputError, validateDesktopInput } from "../src/shared/validation.js";

describe("validateDesktopInput", () => {
  it("normalizes a valid renderer payload", () => {
    expect(validateDesktopInput({
      baseUrl: " https://example.com/v1 ",
      model: " model-id ",
      apiKey: " secret ",
      timeoutSeconds: 45,
      testStream: true
    })).toEqual({
      provider: "openai-compatible",
      baseUrl: "https://example.com/v1",
      model: "model-id",
      apiKey: "secret",
      timeoutSeconds: 45,
      testStream: true
    });
  });

  it.each([
    [null, "configuration"],
    [{ baseUrl: "", model: "m", apiKey: "k", timeoutSeconds: 30 }, "base URL"],
    [{ baseUrl: "x", model: "", apiKey: "k", timeoutSeconds: 30 }, "Model ID"],
    [{ baseUrl: "x", model: "m", apiKey: "", timeoutSeconds: 30 }, "API key"],
    [{ baseUrl: "x", model: "m", apiKey: "k", timeoutSeconds: 0 }, "Timeout"],
    [{ baseUrl: "x", model: "m", apiKey: "k", timeoutSeconds: 301 }, "Timeout"]
  ])("rejects invalid input", (input, message) => {
    expect(() => validateDesktopInput(input)).toThrowError(DesktopInputError);
    expect(() => validateDesktopInput(input)).toThrow(message as string);
  });

  it("enforces defensive length limits", () => {
    expect(() => validateDesktopInput({ baseUrl: "x".repeat(2_049), model: "m", apiKey: "k", timeoutSeconds: 30 })).toThrow("too long");
    expect(() => validateDesktopInput({ baseUrl: "x", model: "m".repeat(257), apiKey: "k", timeoutSeconds: 30 })).toThrow("too long");
    expect(() => validateDesktopInput({ baseUrl: "x", model: "m", apiKey: "k".repeat(8_193), timeoutSeconds: 30 })).toThrow("too long");
  });

  it("preserves supported provider settings and rejects unknown providers", () => {
    expect(validateDesktopInput({
      provider: "azure-openai",
      baseUrl: "https://resource.openai.azure.com",
      model: "deployment",
      apiKey: "secret",
      apiVersion: "2024-10-21",
      timeoutSeconds: 30,
      testStream: false
    })).toMatchObject({ provider: "azure-openai", apiVersion: "2024-10-21" });
    expect(() => validateDesktopInput({
      provider: "unknown",
      baseUrl: "https://example.com",
      model: "m",
      apiKey: "k",
      timeoutSeconds: 30
    })).toThrow("not supported");
  });
});

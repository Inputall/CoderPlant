import { afterEach, describe, expect, it } from "vitest";
import { ConfigurationError, resolveCheckInput, type CheckCommandOptions } from "../src/config/input.js";

const originalKey = process.env.TEST_LLM_DOCTOR_KEY;

function options(overrides: Partial<CheckCommandOptions> = {}): CheckCommandOptions {
  return {
    baseUrl: "https://example.com/v1",
    model: "test-model",
    provider: "openai-compatible",
    apiKeyEnv: "TEST_LLM_DOCTOR_KEY",
    timeout: "2.5",
    stream: true,
    format: "json",
    nonInteractive: true,
    streamExplicit: true,
    ...overrides
  };
}

afterEach(() => {
  if (originalKey === undefined) delete process.env.TEST_LLM_DOCTOR_KEY;
  else process.env.TEST_LLM_DOCTOR_KEY = originalKey;
  delete process.env.ANTHROPIC_API_KEY;
});

describe("resolveCheckInput", () => {
  it("resolves non-interactive configuration from arguments and environment", async () => {
    process.env.TEST_LLM_DOCTOR_KEY = "test-secret";
    await expect(resolveCheckInput(options({ output: "report.json" }))).resolves.toEqual({
      config: {
        endpoint: "https://example.com/v1",
        model: "test-model",
        apiKey: "test-secret",
        timeoutMs: 2500,
        testStream: true,
        provider: "openai-compatible"
      },
      format: "json",
      outputPath: "report.json"
    });
  });

  it("rejects invalid timeout and environment names", async () => {
    process.env.TEST_LLM_DOCTOR_KEY = "test-secret";
    await expect(resolveCheckInput(options({ timeout: "0" }))).rejects.toThrow(ConfigurationError);
    await expect(resolveCheckInput(options({ apiKeyEnv: "bad-name" }))).rejects.toThrow("environment variable");
  });

  it("reports all missing values without prompting in non-interactive mode", async () => {
    delete process.env.TEST_LLM_DOCTOR_KEY;
    await expect(resolveCheckInput(options({ baseUrl: "", model: "" })))
      .rejects.toThrow("--base-url, --model, TEST_LLM_DOCTOR_KEY");
  });

  it("uses provider-specific endpoint, key environment, and API version defaults", async () => {
    process.env.ANTHROPIC_API_KEY = "anthropic-secret";
    const providerOptions: CheckCommandOptions = {
      provider: "anthropic",
      model: "claude-test",
      timeout: "30",
      stream: false,
      format: "terminal",
      nonInteractive: true,
      streamExplicit: false
    };
    await expect(resolveCheckInput(providerOptions)).resolves.toMatchObject({
      config: {
        provider: "anthropic",
        endpoint: "https://api.anthropic.com",
        model: "claude-test",
        apiKey: "anthropic-secret",
        apiVersion: "2023-06-01",
        testStream: false
      }
    });
  });
});

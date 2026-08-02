import prompts, { type PromptObject } from "prompts";
import type { DiagnosticConfig, ProviderId, ReportFormat } from "../core/types.js";
import { getProviderAdapter, isProviderId } from "../providers/index.js";

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export interface CheckCommandOptions {
  baseUrl?: string;
  model?: string;
  provider: ProviderId;
  apiKeyEnv?: string;
  apiVersion?: string;
  timeout: string;
  stream: boolean;
  format: ReportFormat;
  output?: string;
  nonInteractive: boolean;
  streamExplicit: boolean;
}

export interface ResolvedCheckInput {
  config: DiagnosticConfig;
  format: ReportFormat;
  outputPath?: string;
}

function parseTimeout(value: string): number {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new ConfigurationError("--timeout must be a positive number of seconds.");
  }
  return Math.round(seconds * 1000);
}

export async function resolveCheckInput(options: CheckCommandOptions): Promise<ResolvedCheckInput> {
  if (!isProviderId(options.provider)) {
    throw new ConfigurationError(`Unsupported provider: ${String(options.provider)}.`);
  }
  const adapter = getProviderAdapter(options.provider);
  const envName = options.apiKeyEnv?.trim() || adapter.defaultApiKeyEnv;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(envName)) {
    throw new ConfigurationError("--api-key-env must be a valid environment variable name.");
  }

  let endpoint = options.baseUrl?.trim() || adapter.defaultBaseUrl || "";
  let model = options.model?.trim() ?? "";
  let apiKey = process.env[envName]?.trim() ?? "";
  let testStream = options.stream;
  const apiVersion = options.apiVersion?.trim() || adapter.defaultApiVersion;
  const hasMissingRequired = !endpoint || !model || !apiKey;

  if (hasMissingRequired && options.nonInteractive) {
    const missing = [
      !endpoint ? "--base-url" : "",
      !model ? "--model" : "",
      !apiKey ? envName : ""
    ].filter(Boolean);
    throw new ConfigurationError(`Missing required configuration: ${missing.join(", ")}.`);
  }

  if (hasMissingRequired) {
    const questions: PromptObject[] = [];
    if (!endpoint) {
      questions.push({
        type: "text",
        name: "endpoint",
        message: "API base URL",
        validate: (value: string) => value.trim() ? true : "API base URL is required."
      });
    }
    if (!model) {
      questions.push({
        type: "text",
        name: "model",
        message: "Model ID",
        validate: (value: string) => value.trim() ? true : "Model ID is required."
      });
    }
    if (!apiKey) {
      questions.push({
        type: "password",
        name: "apiKey",
        message: `API key (${envName})`,
        validate: (value: string) => value.trim() ? true : "API key is required."
      });
    }
    if (!options.streamExplicit) {
      questions.push({
        type: "confirm",
        name: "testStream",
        message: "Test streaming output",
        initial: false
      });
    }

    const answers = await prompts(questions, {
      onCancel: () => {
        throw new ConfigurationError("Interactive input was cancelled.");
      }
    });
    endpoint = typeof answers.endpoint === "string" ? answers.endpoint.trim() : endpoint;
    model = typeof answers.model === "string" ? answers.model.trim() : model;
    apiKey = typeof answers.apiKey === "string" ? answers.apiKey.trim() : apiKey;
    if (typeof answers.testStream === "boolean") {
      testStream = answers.testStream;
    }
  }

  const resolved: ResolvedCheckInput = {
    config: {
      endpoint,
      model,
      apiKey,
      timeoutMs: parseTimeout(options.timeout),
      testStream,
      provider: options.provider,
      ...(apiVersion ? { apiVersion } : {})
    },
    format: options.format
  };
  if (options.output?.trim()) {
    resolved.outputPath = options.output.trim();
  }
  return resolved;
}

import type { DesktopDiagnosticInput } from "./contracts.js";
import type { ProviderId } from "../../../dist/index.js";

const providerIds = new Set<ProviderId>([
  "openai-compatible",
  "openai-responses",
  "anthropic",
  "gemini",
  "azure-openai"
]);

export class DesktopInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DesktopInputError";
  }
}

export function validateDesktopInput(value: unknown): DesktopDiagnosticInput {
  if (!value || typeof value !== "object") {
    throw new DesktopInputError("Diagnostic configuration is missing.");
  }

  const input = value as Record<string, unknown>;
  const providerValue = typeof input.provider === "string" ? input.provider : "openai-compatible";
  if (!providerIds.has(providerValue as ProviderId)) {
    throw new DesktopInputError("API provider is not supported.");
  }
  const provider = providerValue as ProviderId;
  const baseUrl = typeof input.baseUrl === "string" ? input.baseUrl.trim() : "";
  const model = typeof input.model === "string" ? input.model.trim() : "";
  const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  const apiVersion = typeof input.apiVersion === "string" ? input.apiVersion.trim() : "";
  const timeoutSeconds = Number(input.timeoutSeconds);

  if (!baseUrl) throw new DesktopInputError("API base URL is required.");
  if (baseUrl.length > 2_048) throw new DesktopInputError("API base URL is too long.");
  if (!model) throw new DesktopInputError("Model ID is required.");
  if (model.length > 256) throw new DesktopInputError("Model ID is too long.");
  if (!apiKey) throw new DesktopInputError("API key is required.");
  if (apiKey.length > 8_192) throw new DesktopInputError("API key is too long.");
  if (apiVersion.length > 64) throw new DesktopInputError("API version is too long.");
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 300) {
    throw new DesktopInputError("Timeout must be between 1 and 300 seconds.");
  }

  return {
    provider,
    baseUrl,
    model,
    apiKey,
    ...(apiVersion ? { apiVersion } : {}),
    timeoutSeconds,
    testStream: input.testStream === true
  };
}

import type { DiagnosticConfig, ProviderId } from "../core/types.js";
import type { SseEvent } from "../checks/sse-parser.js";

export interface ProviderEndpoint {
  endpoint: string;
  warnings: string[];
}

export interface ProviderResponseValidation {
  valid: boolean;
  content: string;
  hasUsage: boolean;
  issues?: string[];
}

export interface ProviderStreamInspection {
  valid: boolean;
  ignored?: boolean;
  text?: string;
  completed?: boolean;
}

export interface ProviderAdapter {
  id: ProviderId;
  label: string;
  responseLabel: string;
  streamLabel: string;
  defaultBaseUrl?: string;
  defaultApiKeyEnv: string;
  defaultApiVersion?: string;
  normalizeEndpoint: (input: string, model: string, apiVersion?: string) => ProviderEndpoint;
  requestUrl?: (config: DiagnosticConfig, stream: boolean) => string;
  createRequestInit: (config: DiagnosticConfig, stream: boolean, signal: AbortSignal) => RequestInit;
  validateResponse: (value: unknown) => ProviderResponseValidation;
  inspectStreamEvent: (event: SseEvent) => ProviderStreamInspection;
  streamCompletesOnEof?: boolean;
}

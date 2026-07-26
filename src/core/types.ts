export type CheckStatus = "pass" | "fail" | "warn" | "skip";

export type ReportFormat = "terminal" | "json" | "markdown";

export type ProviderId =
  | "openai-compatible"
  | "openai-responses"
  | "anthropic"
  | "gemini"
  | "azure-openai";

export interface DiagnosticConfig {
  endpoint: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
  testStream: boolean;
  provider?: ProviderId;
  apiVersion?: string;
  signal?: AbortSignal;
}

export interface CheckResult {
  id: string;
  name: string;
  status: CheckStatus;
  durationMs?: number;
  message: string;
  suggestion?: string;
  details?: Record<string, unknown>;
}

export interface DiagnosticSummary {
  status: Exclude<CheckStatus, "skip">;
  pass: number;
  fail: number;
  warn: number;
  skip: number;
}

export interface DiagnosticReport {
  version: string;
  provider: ProviderId;
  endpoint: string;
  model: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  summary: DiagnosticSummary;
  results: CheckResult[];
}

export interface RequestTimings {
  headerLatencyMs: number;
  totalDurationMs: number;
  ttftMs?: number;
}

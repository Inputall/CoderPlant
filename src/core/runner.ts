import { performance } from "node:perf_hooks";
import { runChatCheck } from "../checks/chat.js";
import { runStreamCheck } from "../checks/stream.js";
import { DiagnosticCancelledError } from "./http.js";
import { classifyRequestError } from "../errors/classify.js";
import { redactText, redactUrl, redactValue } from "../security/redact.js";
import { VERSION } from "../version.js";
import { createDiagnosticContext } from "./context.js";
import { getProviderAdapter } from "../providers/index.js";
import type {
  CheckResult,
  DiagnosticConfig,
  DiagnosticReport,
  DiagnosticSummary
} from "./types.js";

function summarize(results: CheckResult[]): DiagnosticSummary {
  const summary: DiagnosticSummary = { status: "pass", pass: 0, fail: 0, warn: 0, skip: 0 };
  for (const result of results) {
    summary[result.status] += 1;
  }
  summary.status = summary.fail > 0 ? "fail" : summary.warn > 0 ? "warn" : "pass";
  return summary;
}

export async function runDiagnostic(config: DiagnosticConfig): Promise<DiagnosticReport> {
  const context = createDiagnosticContext(config);
  const results: CheckResult[] = [];
  let endpoint = config.endpoint;
  const provider = config.provider ?? "openai-compatible";
  const adapter = getProviderAdapter(provider);

  try {
    const normalized = adapter.normalizeEndpoint(config.endpoint, config.model, config.apiVersion);
    endpoint = normalized.endpoint;
    results.push({
      id: "url.normalization",
      name: "API endpoint",
      status: normalized.warnings.length > 0 ? "warn" : "pass",
      message: normalized.warnings.length > 0
        ? normalized.warnings.join(" ")
        : "The API endpoint was normalized successfully.",
      details: { endpoint: redactUrl(endpoint, [config.apiKey]) }
    });

  } catch (error) {
    const classification = classifyRequestError(error);
    results.push({
      id: "url.normalization",
      name: "API endpoint",
      status: "fail",
      message: redactText(classification.message, [config.apiKey]),
      suggestion: classification.suggestion
    });
    return createReport(context.startedAt, context.startedAtPerformance, endpoint, config, results);
  }

  const normalizedConfig: DiagnosticConfig = { ...config, provider, endpoint };
  results.push(...await runChatCheck(normalizedConfig, adapter));
  throwIfCancelled(config.signal);
  if (config.testStream) {
    results.push(...await runStreamCheck(normalizedConfig, adapter));
  } else {
    results.push({
      id: "stream.request",
      name: "Streaming request",
      status: "skip",
      message: "Streaming diagnostics were not requested."
    });
  }

  return createReport(context.startedAt, context.startedAtPerformance, endpoint, config, results);
}

function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DiagnosticCancelledError();
  }
}

function createReport(
  startedAt: Date,
  startedAtPerformance: number,
  endpoint: string,
  config: DiagnosticConfig,
  results: CheckResult[]
): DiagnosticReport {
  const safeResults = redactValue(results, [config.apiKey]) as CheckResult[];
  const finishedAt = new Date();
  const durationMs = Math.round((performance.now() - startedAtPerformance) * 10) / 10;
  return {
    version: VERSION,
    provider: config.provider ?? "openai-compatible",
    endpoint: redactUrl(endpoint, [config.apiKey]),
    model: redactText(config.model, [config.apiKey]),
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs,
    summary: summarize(safeResults),
    results: safeResults
  };
}

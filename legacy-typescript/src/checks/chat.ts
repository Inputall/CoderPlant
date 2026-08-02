import { performance } from "node:perf_hooks";
import type { CheckResult, DiagnosticConfig } from "../core/types.js";
import {
  createTimeout,
  DiagnosticCancelledError,
  fetchWithSafeRedirects,
  readResponseText
} from "../core/http.js";
import { classifyHttpStatus, classifyRequestError } from "../errors/classify.js";
import { redactText } from "../security/redact.js";
import type { ProviderAdapter } from "../providers/index.js";

function elapsed(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 10) / 10;
}

function isHtml(contentType: string, body: string): boolean {
  return contentType.includes("text/html") || /^\s*(?:<!doctype\s+html|<html\b)/i.test(body);
}

export async function runChatCheck(config: DiagnosticConfig, adapter: ProviderAdapter): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const startedAt = performance.now();
  const timeout = createTimeout(config.timeoutMs, config.signal);

  try {
    const response = await fetchWithSafeRedirects(
      adapter.requestUrl?.(config, false) ?? config.endpoint,
      adapter.createRequestInit(config, false, timeout.signal)
    );
    const headerLatencyMs = elapsed(startedAt);

    if (!response.ok) {
      const body = await readResponseText(response, 8 * 1024);
      const classification = classifyHttpStatus(response.status);
      const preview = redactText(body.slice(0, 512), [config.apiKey]).trim();
      const failure: CheckResult = {
        id: "chat.http",
        name: "Non-streaming HTTP request",
        status: "fail",
        durationMs: headerLatencyMs,
        message: `${classification.message} (HTTP ${response.status})`,
        suggestion: classification.suggestion
      };
      if (preview) {
        failure.details = { responsePreview: preview };
      }
      return [failure];
    }

    results.push({
      id: "chat.http",
      name: "Non-streaming HTTP request",
      status: "pass",
      durationMs: headerLatencyMs,
      message: `Received HTTP ${response.status}.`,
      details: { headerLatencyMs }
    });

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    const body = await readResponseText(response);
    const totalDurationMs = elapsed(startedAt);

    if (isHtml(contentType, body)) {
      results.push({
        id: "chat.content_type",
        name: "Non-streaming content type",
        status: "fail",
        durationMs: totalDurationMs,
        message: "The endpoint returned HTML instead of an API response.",
        suggestion: "Use the API base URL rather than a website URL."
      });
      return results;
    }

    const jsonContentType = contentType.includes("application/json") || contentType.includes("+json");
    results.push({
      id: "chat.content_type",
      name: "Non-streaming content type",
      status: jsonContentType ? "pass" : "warn",
      message: jsonContentType
        ? `Received ${contentType}.`
        : `Expected JSON Content-Type but received ${contentType || "no Content-Type"}.`,
      ...(jsonContentType ? {} : { suggestion: "Return application/json for non-streaming responses." })
    });

    let data: unknown;
    try {
      data = JSON.parse(body);
    } catch {
      results.push({
        id: "chat.schema",
        name: "Chat Completions response",
        status: "fail",
        durationMs: totalDurationMs,
        message: "The response body is not valid JSON.",
        suggestion: "Check the endpoint and any proxy response transformation."
      });
      return results;
    }

    const validation = adapter.validateResponse(data);
    if (!validation.valid) {
      results.push({
        id: "chat.schema",
        name: "Chat Completions response",
        status: "fail",
        durationMs: totalDurationMs,
        message: `The JSON response does not match the required ${adapter.responseLabel} structure.`,
        suggestion: `Ensure the provider returns standard ${adapter.responseLabel} fields.`,
        details: { issues: validation.issues }
      });
      return results;
    }

    results.push({
      id: "chat.schema",
      name: adapter.responseLabel,
      status: "pass",
      durationMs: totalDurationMs,
      message: `The response contains the required ${adapter.responseLabel} fields.`,
      details: { totalDurationMs }
    });
    results.push({
      id: "chat.content",
      name: "Model text response",
      status: validation.content.trim() === "OK" ? "pass" : "warn",
      message: validation.content.trim() === "OK"
        ? "The model followed the minimal text instruction."
        : "The API returned text, but it was not exactly OK.",
      ...(validation.content.trim() === "OK"
        ? {}
        : { suggestion: "The interface works; check model instruction-following behavior." })
    });
    results.push({
      id: "chat.usage",
      name: "Token usage metadata",
      status: validation.hasUsage ? "pass" : "warn",
      message: validation.hasUsage
        ? "The response includes usage metadata."
        : "The response omits optional usage metadata.",
      ...(validation.hasUsage ? {} : { suggestion: "Usage is optional for V1 compatibility." })
    });
    return results;
  } catch (error) {
    if (error instanceof DiagnosticCancelledError || config.signal?.aborted) {
      throw new DiagnosticCancelledError();
    }
    const classification = classifyRequestError(error);
    results.push({
      id: "chat.request",
      name: "Non-streaming request",
      status: "fail",
      durationMs: elapsed(startedAt),
      message: redactText(classification.message, [config.apiKey]),
      suggestion: classification.suggestion
    });
    return results;
  } finally {
    timeout.cancel();
  }
}

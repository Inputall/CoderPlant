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
import { SseParser } from "./sse-parser.js";
import type { ProviderAdapter } from "../providers/index.js";

function elapsed(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 10) / 10;
}

export async function runStreamCheck(config: DiagnosticConfig, adapter: ProviderAdapter): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const startedAt = performance.now();
  const timeout = createTimeout(config.timeoutMs, config.signal);

  try {
    const response = await fetchWithSafeRedirects(
      adapter.requestUrl?.(config, true) ?? config.endpoint,
      adapter.createRequestInit(config, true, timeout.signal)
    );
    const headerLatencyMs = elapsed(startedAt);

    if (!response.ok) {
      const body = await readResponseText(response, 8 * 1024);
      const classification = classifyHttpStatus(response.status);
      const preview = redactText(body.slice(0, 512), [config.apiKey]).trim();
      const failure: CheckResult = {
        id: "stream.http",
        name: "Streaming HTTP request",
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
      id: "stream.http",
      name: "Streaming HTTP request",
      status: "pass",
      durationMs: headerLatencyMs,
      message: `Received HTTP ${response.status}.`,
      details: { headerLatencyMs }
    });

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    const isEventStream = contentType.includes("text/event-stream");
    results.push({
      id: "stream.content_type",
      name: "Streaming content type",
      status: isEventStream ? "pass" : "fail",
      message: isEventStream
        ? `Received ${contentType}.`
        : `Expected text/event-stream but received ${contentType || "no Content-Type"}.`,
      ...(isEventStream ? {} : { suggestion: "Return text/event-stream for stream=true requests." })
    });

    if (!response.body) {
      results.push({
        id: "stream.protocol",
        name: "SSE protocol",
        status: "fail",
        message: "The streaming response has no readable body.",
        suggestion: "Ensure the server keeps an SSE response body open."
      });
      return results;
    }

    let dataEventCount = 0;
    let invalidEventCount = 0;
    let validEventCount = 0;
    let completed = false;
    let textSeen = false;
    let firstTextAt: number | undefined;

    const parser = new SseParser((event) => {
      dataEventCount += 1;
      const inspection = adapter.inspectStreamEvent(event);
      if (!inspection.valid) {
        invalidEventCount += 1;
        return;
      }
      validEventCount += 1;
      if (inspection.completed) completed = true;
      if (inspection.text && inspection.text.length > 0) {
        textSeen = true;
        firstTextAt ??= performance.now();
      }
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      parser.feed(decoder.decode(value, { stream: true }));
    }
    parser.feed(decoder.decode());
    parser.finish();

    const totalDurationMs = elapsed(startedAt);
    if (adapter.streamCompletesOnEof && validEventCount > 0) completed = true;
    const protocolValid = dataEventCount > 0
      && invalidEventCount === 0
      && validEventCount > 0;
    results.push({
      id: "stream.protocol",
      name: "SSE protocol",
      status: protocolValid ? "pass" : "fail",
      message: protocolValid
        ? `Parsed ${dataEventCount} SSE data events and ${validEventCount} valid ${adapter.streamLabel}.`
        : `The stream contains missing or invalid ${adapter.streamLabel}.`,
      ...(protocolValid ? {} : {
        suggestion: `Check SSE data framing and ${adapter.streamLabel}.`,
        details: { dataEventCount, invalidEventCount, validEventCount }
      })
    });
    results.push({
      id: "stream.content",
      name: "Streaming text response",
      status: textSeen ? "pass" : "fail",
      message: textSeen ? "The stream produced non-empty text content." : "The stream produced no text content.",
      ...(textSeen ? {} : { suggestion: "Ensure delta.content contains generated text." })
    });
    results.push({
      id: "stream.termination",
      name: "Streaming termination",
      status: completed ? "pass" : "fail",
      message: completed ? "The provider stream completed successfully." : "The stream ended without a provider completion event.",
      ...(completed ? {} : { suggestion: `Ensure the stream emits the expected completion event for ${adapter.label}.` })
    });

    const ttftMs = firstTextAt === undefined
      ? undefined
      : Math.round((firstTextAt - startedAt) * 10) / 10;
    const timingDetails: Record<string, unknown> = { headerLatencyMs, totalDurationMs };
    if (ttftMs !== undefined) {
      timingDetails.ttftMs = ttftMs;
    }
    results.push({
      id: "stream.timing",
      name: "Streaming latency",
      status: ttftMs === undefined ? "warn" : "pass",
      durationMs: totalDurationMs,
      message: ttftMs === undefined
        ? `Headers arrived in ${headerLatencyMs} ms; TTFT was unavailable.`
        : `Headers arrived in ${headerLatencyMs} ms; TTFT was ${ttftMs} ms; total was ${totalDurationMs} ms.`,
      details: timingDetails
    });
    return results;
  } catch (error) {
    if (error instanceof DiagnosticCancelledError || config.signal?.aborted) {
      throw new DiagnosticCancelledError();
    }
    const classification = classifyRequestError(error);
    results.push({
      id: "stream.request",
      name: "Streaming request",
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

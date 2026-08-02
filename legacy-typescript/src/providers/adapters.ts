import type { DiagnosticConfig } from "../core/types.js";
import { createChatRequestBody } from "../core/http.js";
import { normalizeEndpoint } from "../url/normalize.js";
import { validateChatResponse } from "../validation/chat-response.js";
import { validateStreamChunk } from "../validation/stream-chunk.js";
import {
  isRecord,
  jsonRequest,
  normalizeSuffix,
  parseEventJson,
  parseHttpUrl
} from "./common.js";
import type { ProviderAdapter, ProviderResponseValidation, ProviderStreamInspection } from "./types.js";

function bearerChatRequest(config: DiagnosticConfig, stream: boolean, signal: AbortSignal): RequestInit {
  return jsonRequest({
    Authorization: `Bearer ${config.apiKey}`,
    Accept: stream ? "text/event-stream" : "application/json"
  }, JSON.parse(createChatRequestBody(config.model, stream)), signal);
}

function validateOpenAiChat(value: unknown): ProviderResponseValidation {
  const result = validateChatResponse(value);
  return result.valid
    ? { valid: true, content: result.content, hasUsage: result.hasUsage }
    : { valid: false, content: "", hasUsage: false, issues: result.issues };
}

function inspectOpenAiStream(data: string): ProviderStreamInspection {
  if (data.trim() === "[DONE]") return { valid: true, completed: true };
  const value = parseEventJson(data);
  if (!value) return { valid: false };
  const result = validateStreamChunk(value);
  if (!result.valid) return { valid: false };
  const inspection: ProviderStreamInspection = { valid: true };
  if (result.content !== undefined) inspection.text = result.content;
  return inspection;
}

export const openAiCompatibleAdapter: ProviderAdapter = {
  id: "openai-compatible",
  label: "OpenAI-compatible",
  responseLabel: "Chat Completions response",
  streamLabel: "SSE Chat Completions events",
  defaultApiKeyEnv: "OPENAI_API_KEY",
  normalizeEndpoint: (input) => normalizeEndpoint(input),
  createRequestInit: bearerChatRequest,
  validateResponse: validateOpenAiChat,
  inspectStreamEvent: (event) => inspectOpenAiStream(event.data)
};

export const azureOpenAiAdapter: ProviderAdapter = {
  id: "azure-openai",
  label: "Azure OpenAI",
  responseLabel: "Azure Chat Completions response",
  streamLabel: "Azure SSE Chat Completions events",
  defaultApiKeyEnv: "AZURE_OPENAI_API_KEY",
  defaultApiVersion: "2024-10-21",
  normalizeEndpoint: (input, model, apiVersion) => {
    const url = parseHttpUrl(input);
    let pathname = url.pathname.replace(/\/+$/, "");
    if (!/\/chat\/completions$/i.test(pathname)) {
      if (/\/openai\/deployments\/[^/]+$/i.test(pathname)) pathname += "/chat/completions";
      else pathname += `/openai/deployments/${encodeURIComponent(model)}/chat/completions`;
    }
    url.pathname = pathname.replace(/^\/?/, "/");
    if (!url.searchParams.has("api-version") && apiVersion) {
      url.searchParams.set("api-version", apiVersion);
    }
    return { endpoint: url.toString(), warnings: [] };
  },
  createRequestInit: (config, stream, signal) => jsonRequest({
    "api-key": config.apiKey,
    Accept: stream ? "text/event-stream" : "application/json"
  }, JSON.parse(createChatRequestBody(config.model, stream)), signal),
  validateResponse: validateOpenAiChat,
  inspectStreamEvent: (event) => inspectOpenAiStream(event.data)
};

function responseText(value: Record<string, unknown>): string | undefined {
  if (typeof value.output_text === "string") return value.output_text;
  if (!Array.isArray(value.output)) return undefined;
  const texts: string[] = [];
  for (const item of value.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (isRecord(content) && content.type === "output_text" && typeof content.text === "string") {
        texts.push(content.text);
      }
    }
  }
  return texts.length > 0 ? texts.join("") : undefined;
}

export const openAiResponsesAdapter: ProviderAdapter = {
  id: "openai-responses",
  label: "OpenAI Responses",
  responseLabel: "Responses API response",
  streamLabel: "Responses API events",
  defaultBaseUrl: "https://api.openai.com/v1",
  defaultApiKeyEnv: "OPENAI_API_KEY",
  normalizeEndpoint: (input) => normalizeSuffix(input, "/v1/responses"),
  createRequestInit: (config, stream, signal) => jsonRequest({
    Authorization: `Bearer ${config.apiKey}`,
    Accept: stream ? "text/event-stream" : "application/json"
  }, {
    model: config.model,
    input: "Reply with OK only.",
    max_output_tokens: 5,
    stream
  }, signal),
  validateResponse: (value) => {
    if (!isRecord(value)) return { valid: false, content: "", hasUsage: false, issues: ["response: expected object"] };
    const content = responseText(value);
    const valid = typeof value.id === "string" && value.object === "response" && typeof content === "string";
    return valid
      ? { valid: true, content, hasUsage: value.usage !== undefined }
      : { valid: false, content: "", hasUsage: false, issues: ["response: missing id, object=response, or output_text"] };
  },
  inspectStreamEvent: (event) => {
    if (event.data.trim() === "[DONE]") return { valid: true, completed: true };
    const value = parseEventJson(event.data);
    if (!value || typeof value.type !== "string") return { valid: false };
    if (value.type === "response.output_text.delta") {
      return typeof value.delta === "string" ? { valid: true, text: value.delta } : { valid: false };
    }
    return { valid: true, ignored: true, completed: value.type === "response.completed" };
  }
};

export const anthropicAdapter: ProviderAdapter = {
  id: "anthropic",
  label: "Anthropic Messages",
  responseLabel: "Anthropic Messages response",
  streamLabel: "Anthropic Messages events",
  defaultBaseUrl: "https://api.anthropic.com",
  defaultApiKeyEnv: "ANTHROPIC_API_KEY",
  defaultApiVersion: "2023-06-01",
  normalizeEndpoint: (input) => normalizeSuffix(input, "/v1/messages"),
  createRequestInit: (config, stream, signal) => jsonRequest({
    "x-api-key": config.apiKey,
    "anthropic-version": config.apiVersion || "2023-06-01",
    Accept: stream ? "text/event-stream" : "application/json"
  }, {
    model: config.model,
    max_tokens: 5,
    messages: [{ role: "user", content: "Reply with OK only." }],
    stream
  }, signal),
  validateResponse: (value) => {
    if (!isRecord(value) || !Array.isArray(value.content)) {
      return { valid: false, content: "", hasUsage: false, issues: ["response: expected Anthropic message content"] };
    }
    const content = value.content
      .filter((item): item is Record<string, unknown> => isRecord(item) && item.type === "text")
      .map((item) => typeof item.text === "string" ? item.text : "")
      .join("");
    const valid = typeof value.id === "string" && value.type === "message" && content.length > 0;
    return valid
      ? { valid: true, content, hasUsage: value.usage !== undefined }
      : { valid: false, content: "", hasUsage: false, issues: ["response: missing message id, type, or text content"] };
  },
  inspectStreamEvent: (event) => {
    const value = parseEventJson(event.data);
    if (!value || typeof value.type !== "string") return { valid: false };
    if (value.type === "content_block_delta") {
      const delta = value.delta;
      return isRecord(delta) && delta.type === "text_delta" && typeof delta.text === "string"
        ? { valid: true, text: delta.text }
        : { valid: false };
    }
    return { valid: true, ignored: true, completed: value.type === "message_stop" };
  }
};

function geminiText(value: Record<string, unknown>): string | undefined {
  if (!Array.isArray(value.candidates) || value.candidates.length === 0) return undefined;
  const candidate = value.candidates[0];
  if (!isRecord(candidate) || !isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) return undefined;
  const text = candidate.content.parts
    .filter(isRecord)
    .map((part) => typeof part.text === "string" ? part.text : "")
    .join("");
  return text || undefined;
}

function normalizeGeminiEndpoint(input: string, model: string) {
  const url = parseHttpUrl(input);
  let pathname = url.pathname.replace(/\/+$/, "");
  pathname = pathname.replace(/:streamGenerateContent$/i, ":generateContent");
  if (!/:generateContent$/i.test(pathname)) {
    if (!/\/v1(?:beta)?$/i.test(pathname)) pathname += "/v1beta";
    pathname += `/models/${encodeURIComponent(model)}:generateContent`;
  }
  url.pathname = pathname.replace(/^\/?/, "/");
  return { endpoint: url.toString(), warnings: [] };
}

export const geminiAdapter: ProviderAdapter = {
  id: "gemini",
  label: "Google Gemini",
  responseLabel: "Gemini generateContent response",
  streamLabel: "Gemini SSE response chunks",
  defaultBaseUrl: "https://generativelanguage.googleapis.com",
  defaultApiKeyEnv: "GEMINI_API_KEY",
  normalizeEndpoint: normalizeGeminiEndpoint,
  requestUrl: (config, stream) => {
    const url = new URL(config.endpoint);
    if (stream) {
      url.pathname = url.pathname.replace(/:generateContent$/i, ":streamGenerateContent");
      url.searchParams.set("alt", "sse");
    }
    return url.toString();
  },
  createRequestInit: (config, stream, signal) => jsonRequest({
    "x-goog-api-key": config.apiKey,
    Accept: stream ? "text/event-stream" : "application/json"
  }, {
    contents: [{ role: "user", parts: [{ text: "Reply with OK only." }] }],
    generationConfig: { maxOutputTokens: 5 }
  }, signal),
  validateResponse: (value) => {
    if (!isRecord(value)) return { valid: false, content: "", hasUsage: false, issues: ["response: expected object"] };
    const content = geminiText(value);
    return content
      ? { valid: true, content, hasUsage: value.usageMetadata !== undefined }
      : { valid: false, content: "", hasUsage: false, issues: ["response: missing candidates[0].content.parts text"] };
  },
  inspectStreamEvent: (event) => {
    const value = parseEventJson(event.data);
    if (!value) return { valid: false };
    const text = geminiText(value);
    const candidate = Array.isArray(value.candidates) ? value.candidates[0] : undefined;
    const completed = isRecord(candidate) && typeof candidate.finishReason === "string";
    if (!text && !completed) return { valid: false };
    const inspection: ProviderStreamInspection = { valid: true, completed };
    if (text) inspection.text = text;
    return inspection;
  },
  streamCompletesOnEof: true
};

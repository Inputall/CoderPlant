import {
  RequestTimeoutError,
  ResponseBodyTooLargeError,
  SafeRedirectError
} from "../core/http.js";
import { EndpointError } from "../url/normalize.js";

export interface ErrorClassification {
  message: string;
  suggestion: string;
}

export function classifyHttpStatus(status: number): ErrorClassification {
  if (status === 400) {
    return { message: "The API rejected the request parameters.", suggestion: "Check the model ID and Chat Completions parameter compatibility." };
  }
  if (status === 401) {
    return { message: "The API key was rejected.", suggestion: "Check the key and Bearer authentication support." };
  }
  if (status === 403) {
    return { message: "The account is not allowed to use this endpoint or model.", suggestion: "Check account, plan, and model permissions." };
  }
  if (status === 404) {
    return { message: "The Chat Completions endpoint was not found.", suggestion: "Check the base URL and /v1/chat/completions path." };
  }
  if (status === 408) {
    return { message: "The server reported a request timeout.", suggestion: "Retry later or increase --timeout." };
  }
  if (status === 429) {
    return { message: "The API reported rate limiting or insufficient quota.", suggestion: "Check quota and retry after the provider's cooldown." };
  }
  if (status >= 500) {
    return { message: `The gateway or upstream service failed with HTTP ${status}.`, suggestion: "Retry later or contact the API provider." };
  }
  return { message: `The API returned unexpected HTTP ${status}.`, suggestion: "Inspect the endpoint and provider documentation." };
}

export function classifyRequestError(error: unknown): ErrorClassification {
  if (error instanceof RequestTimeoutError) {
    return { message: error.message, suggestion: "Increase --timeout or check upstream latency." };
  }
  if (error instanceof SafeRedirectError) {
    return { message: error.message, suggestion: "Use the final same-origin API endpoint directly." };
  }
  if (error instanceof EndpointError) {
    return { message: error.message, suggestion: "Provide an absolute HTTP(S) API base URL." };
  }
  if (error instanceof ResponseBodyTooLargeError) {
    return { message: error.message, suggestion: "Check whether the endpoint is returning an API response." };
  }

  const causeCode = getCauseCode(error);
  if (causeCode === "ENOTFOUND" || causeCode === "EAI_AGAIN") {
    return { message: "The API host could not be resolved.", suggestion: "Check DNS and the API hostname." };
  }
  if (causeCode === "ECONNREFUSED") {
    return { message: "The API server refused the connection.", suggestion: "Check the host, port, and service status." };
  }
  if (causeCode?.startsWith("CERT_") || causeCode?.includes("TLS")) {
    return { message: "TLS certificate validation failed.", suggestion: "Fix the server certificate; do not disable TLS verification." };
  }

  const message = error instanceof Error ? error.message : "Unknown request failure.";
  return { message, suggestion: "Check network connectivity and the API endpoint." };
}

function getCauseCode(error: unknown): string | undefined {
  if (!(error instanceof Error) || !("cause" in error)) {
    return undefined;
  }
  const cause = error.cause;
  if (cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string") {
    return cause.code;
  }
  return undefined;
}

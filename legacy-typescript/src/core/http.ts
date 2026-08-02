export class SafeRedirectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SafeRedirectError";
  }
}

export class RequestTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs} ms.`);
    this.name = "RequestTimeoutError";
  }
}

export class DiagnosticCancelledError extends Error {
  constructor() {
    super("Diagnostic run was cancelled.");
    this.name = "DiagnosticCancelledError";
  }
}

export class ResponseBodyTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`Response body exceeded the ${maxBytes} byte safety limit.`);
    this.name = "ResponseBodyTooLargeError";
  }
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface TimeoutHandle {
  signal: AbortSignal;
  cancel: () => void;
}

export function createTimeout(timeoutMs: number, parentSignal?: AbortSignal): TimeoutHandle {
  const controller = new AbortController();
  const cancelFromParent = () => controller.abort(new DiagnosticCancelledError());
  const timer = setTimeout(() => {
    controller.abort(new RequestTimeoutError(timeoutMs));
  }, timeoutMs);
  timer.unref?.();
  if (parentSignal?.aborted) {
    cancelFromParent();
  } else {
    parentSignal?.addEventListener("abort", cancelFromParent, { once: true });
  }
  return {
    signal: controller.signal,
    cancel: () => {
      clearTimeout(timer);
      parentSignal?.removeEventListener("abort", cancelFromParent);
    }
  };
}

export async function fetchWithSafeRedirects(
  endpoint: string,
  init: RequestInit,
  maxRedirects = 3
): Promise<Response> {
  const originalOrigin = new URL(endpoint).origin;
  let currentUrl = endpoint;

  for (let redirectCount = 0; ; redirectCount += 1) {
    const response = await fetch(currentUrl, { ...init, redirect: "manual" });
    if (!REDIRECT_STATUSES.has(response.status)) {
      return response;
    }

    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location) {
      throw new SafeRedirectError("The server returned a redirect without a Location header.");
    }
    if (redirectCount >= maxRedirects) {
      throw new SafeRedirectError(`The request exceeded ${maxRedirects} redirects.`);
    }

    const target = new URL(location, currentUrl);
    if (target.origin !== originalOrigin) {
      throw new SafeRedirectError("Blocked a cross-origin redirect to protect the API key.");
    }
    if (response.status !== 307 && response.status !== 308) {
      throw new SafeRedirectError(
        `Refused HTTP ${response.status} redirect because it may change POST to GET.`
      );
    }
    currentUrl = target.toString();
  }
}

export async function readResponseText(
  response: Response,
  maxBytes = 64 * 1024
): Promise<string> {
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let output = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    bytesRead += value.byteLength;
    if (bytesRead > maxBytes) {
      await reader.cancel();
      throw new ResponseBodyTooLargeError(maxBytes);
    }
    output += decoder.decode(value, { stream: true });
  }

  return output + decoder.decode();
}

export function createChatRequestBody(model: string, stream: boolean): string {
  return JSON.stringify({
    model,
    messages: [{ role: "user", content: "Reply with OK only." }],
    max_tokens: 5,
    stream
  });
}

export function createChatRequestInit(
  model: string,
  apiKey: string,
  stream: boolean,
  signal: AbortSignal
): RequestInit {
  return {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: stream ? "text/event-stream" : "application/json"
    },
    body: createChatRequestBody(model, stream),
    signal
  };
}

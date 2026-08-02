import { describe, expect, it } from "vitest";
import {
  createChatRequestBody,
  createTimeout,
  readResponseText,
  RequestTimeoutError,
  ResponseBodyTooLargeError,
  SafeRedirectError
} from "../src/core/http.js";
import { classifyHttpStatus, classifyRequestError } from "../src/errors/classify.js";
import { EndpointError } from "../src/url/normalize.js";

describe("HTTP helpers and error classification", () => {
  it("builds the fixed low-token request", () => {
    expect(JSON.parse(createChatRequestBody("model", true))).toMatchObject({
      model: "model",
      max_tokens: 5,
      stream: true
    });
  });

  it("limits buffered response bodies", async () => {
    await expect(readResponseText(new Response("large"), 2)).rejects.toBeInstanceOf(ResponseBodyTooLargeError);
    await expect(readResponseText(new Response(null))).resolves.toBe("");
  });

  it("creates a cancellable timeout", async () => {
    const timeout = createTimeout(5);
    await new Promise((resolve) => timeout.signal.addEventListener("abort", resolve));
    expect(timeout.signal.reason).toBeInstanceOf(RequestTimeoutError);
    timeout.cancel();
  });

  it("classifies protocol and network failures", () => {
    expect(classifyRequestError(new SafeRedirectError("blocked")).suggestion).toContain("same-origin");
    expect(classifyRequestError(new EndpointError("bad endpoint")).message).toBe("bad endpoint");
    expect(classifyRequestError(new ResponseBodyTooLargeError(1)).message).toContain("safety limit");
    expect(classifyRequestError(new RequestTimeoutError(1)).message).toContain("timed out");

    const dns = new Error("fetch failed", { cause: { code: "ENOTFOUND" } });
    const refused = new Error("fetch failed", { cause: { code: "ECONNREFUSED" } });
    const tls = new Error("fetch failed", { cause: { code: "CERT_EXPIRED" } });
    expect(classifyRequestError(dns).message).toContain("resolved");
    expect(classifyRequestError(refused).message).toContain("refused");
    expect(classifyRequestError(tls).message).toContain("TLS");
    expect(classifyRequestError("unknown").message).toContain("Unknown");
  });

  it("classifies documented and unexpected HTTP statuses", () => {
    for (const status of [400, 401, 403, 404, 408, 429, 500]) {
      expect(classifyHttpStatus(status).message).toBeTruthy();
    }
    expect(classifyHttpStatus(418).message).toContain("418");
  });
});

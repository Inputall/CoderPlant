import { EndpointError } from "../url/normalize.js";
import type { ProviderEndpoint } from "./types.js";

export function parseHttpUrl(input: string): URL {
  const raw = input.trim();
  if (!raw) throw new EndpointError("API base URL is required.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new EndpointError("API base URL is not a valid absolute URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new EndpointError("API base URL must use HTTP or HTTPS.");
  }
  if (url.username || url.password) {
    throw new EndpointError("Credentials in the API URL are not allowed.");
  }
  url.hash = "";
  return url;
}

export function normalizeSuffix(input: string, suffix: string): ProviderEndpoint {
  const url = parseHttpUrl(input);
  const cleanSuffix = suffix.startsWith("/") ? suffix : `/${suffix}`;
  const suffixWithoutVersion = cleanSuffix.replace(/^\/v\d+(?:beta)?/i, "");
  let pathname = url.pathname.replace(/\/+$/, "");

  if (pathname.toLowerCase().endsWith(cleanSuffix.toLowerCase())) {
    // Already canonical.
  } else if (suffixWithoutVersion && pathname.toLowerCase().endsWith(suffixWithoutVersion.toLowerCase())) {
    pathname = `${pathname.slice(0, -suffixWithoutVersion.length)}${cleanSuffix}`;
  } else if (/\/v\d+(?:beta)?$/i.test(pathname)) {
    pathname += suffixWithoutVersion;
  } else {
    pathname += cleanSuffix;
  }

  url.pathname = pathname.replace(/^\/?/, "/");
  return { endpoint: url.toString(), warnings: [] };
}

export function jsonRequest(headers: Record<string, string>, body: unknown, signal: AbortSignal): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseEventJson(data: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(data);
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function exactOk(content: string): boolean {
  return content.trim() === "OK";
}

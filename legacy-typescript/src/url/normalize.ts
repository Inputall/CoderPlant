export interface NormalizedEndpoint {
  endpoint: string;
  warnings: string[];
}

export class EndpointError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EndpointError";
  }
}

function normalizeKnownDuplicates(pathname: string): { pathname: string; changed: boolean } {
  let value = pathname;
  value = value.replace(/(?:\/v1){2,}(?=\/chat\/completions\/?$)/i, "/v1");
  value = value.replace(
    /(?:\/chat\/completions){2,}\/?$/i,
    "/chat/completions"
  );
  return { pathname: value, changed: value !== pathname };
}

export function normalizeEndpoint(input: string): NormalizedEndpoint {
  const raw = input.trim();
  if (!raw) {
    throw new EndpointError("API base URL is required.");
  }

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

  const warnings: string[] = [];
  const duplicateResult = normalizeKnownDuplicates(url.pathname);
  let pathname = duplicateResult.pathname.replace(/\/+$/, "");
  if (duplicateResult.changed) {
    warnings.push("Removed a duplicated Chat Completions path segment.");
  }

  if (/\/v1\/chat\/completions$/i.test(pathname)) {
    // Already canonical.
  } else if (/\/v1$/i.test(pathname)) {
    pathname += "/chat/completions";
  } else if (/\/chat\/completions$/i.test(pathname)) {
    const prefix = pathname.slice(0, -"/chat/completions".length);
    pathname = `${prefix}/v1/chat/completions`;
  } else {
    pathname = `${pathname}/v1/chat/completions`;
  }

  url.pathname = pathname.replace(/^\/?/, "/");
  url.hash = "";

  return { endpoint: url.toString(), warnings };
}

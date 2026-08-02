const MASK = "sk-****";
const SENSITIVE_KEY = /^(?:api[-_]?key|authorization|access[-_]?token|token|key)$/i;
const BEARER_PATTERN = /\bBearer\s+[^\s,;]+/gi;
const OPENAI_KEY_PATTERN = /\bsk-[A-Za-z0-9_-]{6,}\b/g;

export function redactText(value: string, secrets: readonly string[] = []): string {
  let redacted = value;

  for (const secret of secrets) {
    if (secret.length > 0) {
      redacted = redacted.split(secret).join(MASK);
    }
  }

  return redacted
    .replace(BEARER_PATTERN, `Bearer ${MASK}`)
    .replace(OPENAI_KEY_PATTERN, MASK);
}

export function redactUrl(value: string, secrets: readonly string[] = []): string {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    for (const [key] of url.searchParams) {
      if (SENSITIVE_KEY.test(key)) {
        url.searchParams.set(key, MASK);
      }
    }
    return redactText(url.toString(), secrets);
  } catch {
    return redactText(value, secrets);
  }
}

export function redactValue(value: unknown, secrets: readonly string[] = []): unknown {
  if (typeof value === "string") {
    return redactText(value, secrets);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, secrets));
  }
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = SENSITIVE_KEY.test(key) ? MASK : redactValue(item, secrets);
    }
    return output;
  }
  return value;
}

export function maskSecret(): string {
  return MASK;
}

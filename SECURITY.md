# Security

## API Key Handling

LLM API Doctor is a local tool. It does not include telemetry and does not upload diagnostic reports to a project server.

- API keys are read from an environment variable by default.
- Interactive API key input uses a hidden password prompt.
- The key is held only in the private runtime configuration used to build the selected provider's authentication header.
- Public report types do not contain an API key field.
- Results, error text, response previews, URLs, and nested report details pass through a final redaction boundary before rendering.
- Reports do not store complete request or response bodies.
- The configured key and known key-shaped values are redacted before output is rendered.

The HTTP client disables automatic redirects. A redirect to a different origin, including a scheme or port change, is rejected before another request is sent. Same-origin redirects are limited and only HTTP 307/308 are followed so the POST method and body remain unchanged.

## Local HTTP

HTTP URLs are supported because local mock servers and some private development environments use them. Use HTTPS for any remote service to protect the key in transit.

## Reporting a Vulnerability

Do not include real API keys, Authorization headers, or complete provider responses in an issue. Reproduce the problem with a synthetic key and a local mock endpoint where possible.

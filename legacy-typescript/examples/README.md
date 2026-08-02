# Examples

Terminal report with streaming diagnostics:

```bash
npx llm-api-doctor check --base-url https://example.com/v1 --model model-id --stream
```

Machine-readable JSON saved to a file:

```bash
npx llm-api-doctor check \
  --base-url https://example.com/v1/chat/completions \
  --model model-id \
  --stream \
  --format json \
  --output reports/api-check.json \
  --non-interactive
```

Use a provider-specific environment variable without exposing its value as a CLI argument:

```bash
npx llm-api-doctor check \
  --base-url https://example.com/v1 \
  --model model-id \
  --api-key-env PROVIDER_API_KEY \
  --non-interactive
```

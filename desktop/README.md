# LLM API Doctor Desktop

Windows desktop client for LLM API Doctor. It tests OpenAI-compatible Chat Completions, OpenAI Responses, Anthropic Messages, Google Gemini, and Azure OpenAI through the same diagnostic core as the CLI.

The app provides provider-aware endpoint defaults, optional SSE streaming checks, English/Chinese results, latency summaries, and JSON/Markdown export. Streaming is disabled by default, and API keys are never persisted.

## Development

From this directory:

```powershell
npm.cmd install
npm.cmd run dev
```

The `dev` script builds the shared core and starts Electron with hot reload.

## Verification

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

For a renderer-only browser preview:

```powershell
npm.cmd run dev:renderer
```

The browser preview uses a local sample response. Real diagnostics are performed only through the Electron IPC bridge.

## Windows Packages

Build the NSIS installer:

```powershell
npm.cmd run package:win
```

Build the single-file, no-installation version:

```powershell
npm.cmd run package:win:portable
```

Artifacts are written to `desktop/release/`. The portable executable extracts its runtime to a temporary directory when launched; it does not install the app. Code signing is not configured, so Windows may display an unknown publisher warning.

## Security Boundary

- Electron context isolation and renderer sandboxing are enabled.
- Node.js APIs are unavailable to the renderer.
- The preload exposes only run, cancel, and export operations.
- Input is validated again in the main process.
- The API key exists only in renderer memory and the active diagnostic request.
- Non-secret provider, endpoint, model, API version, timeout, and streaming preferences may be stored locally.

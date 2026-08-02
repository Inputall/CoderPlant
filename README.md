# LLM API Doctor

> A lightweight Rust CLI and native Windows desktop tool for diagnosing LLM API compatibility, authentication, response schemas, streaming, and latency.

[![Rust](https://img.shields.io/badge/Rust-1.82%2B-orange?logo=rust)](https://www.rust-lang.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Windows Release](https://img.shields.io/badge/Windows-release-0078d4?logo=windows11)](https://github.com/Inputall/llm-api-doctor/releases/latest)
[![CoderPlant](https://img.shields.io/badge/LLM%20gateway-CoderPlant-07865c)](https://coderplant.com/?utm_source=github&utm_medium=readme&utm_campaign=llm-api-doctor)

LLM API Doctor sends a minimal real request to the endpoint you specify and reports actionable diagnostics. It is designed for model gateways, OpenAI-compatible services, self-hosted inference servers, and direct provider APIs.

LLM API Doctor 会向你指定的接口发送低 Token 的真实请求，并检查认证、响应结构、SSE 流式协议和延迟。项目当前以 Rust 原生实现为主，提供轻量 CLI 和 Windows 原生桌面版。

## Supported Providers

| Provider | Protocol | Default key variable |
| --- | --- | --- |
| OpenAI-compatible | Chat Completions (`/v1/chat/completions`) | `OPENAI_API_KEY` |
| OpenAI Responses | Responses API | `OPENAI_API_KEY` |
| Anthropic | Messages API | `ANTHROPIC_API_KEY` |
| Google Gemini | `generateContent` / SSE | `GEMINI_API_KEY` |
| Azure OpenAI | Chat Completions with deployment URL | `AZURE_OPENAI_API_KEY` |

OpenAI-compatible mode is protocol-based, not brand-limited. It can test compatible endpoints from CoderPlant, DeepSeek, OpenRouter, Groq, Mistral, Qwen, Moonshot, SiliconFlow, Ollama, LM Studio, and other gateways.

## Rust Edition

The Rust implementation lives in [`rust/`](rust/):

- `crates/core`: provider adapters, endpoint normalization, HTTP checks, SSE parsing, timing, redaction, and reports
- `crates/cli`: native `llm-api-doctor` command
- `crates/desktop`: native `egui` Windows desktop application

Streaming is disabled by default. API keys are held only for the active request and are not written to reports.

### Build on Windows

Install Rust with the MSVC toolchain and Visual Studio 2022 Build Tools with the C++ workload. Then use **Developer PowerShell for VS 2022**:

```powershell
cd D:\AI-workspace\Codex\rust
cargo fmt --all -- --check
cargo test --workspace
cargo build --release -p llm-api-doctor
cargo build --release -p llm-api-doctor-desktop
```

Output files are written to `rust/target/release/`.

### Run the Rust CLI

```powershell
$env:OPENAI_API_KEY = "your-api-key"
.\target\release\llm-api-doctor.exe `
  --provider openai-compatible `
  --base-url https://api.example.com/v1 `
  --model MODEL_ID
```

Add `--stream` when you want to test SSE behavior. Reports can be written as JSON or Markdown:

```powershell
.\target\release\llm-api-doctor.exe `
  --base-url https://api.example.com/v1 `
  --model MODEL_ID `
  --format json `
  --output report.json
```

## CoderPlant Example

[CoderPlant](https://coderplant.com/?utm_source=github&utm_medium=readme&utm_campaign=llm-api-doctor) is an LLM gateway that can be checked independently with this tool:

```powershell
$env:OPENAI_API_KEY = "your-coderplant-api-key"
.\target\release\llm-api-doctor.exe `
  --provider openai-compatible `
  --base-url https://coderplant.com `
  --model MODEL_ID
```

Replace `MODEL_ID` with a model enabled in your CoderPlant account. Use `--stream` to verify streaming separately.

## Windows Desktop Release

Download the latest native desktop build from [GitHub Releases](https://github.com/Inputall/llm-api-doctor/releases/latest). The desktop app provides bilingual English/Chinese results and keeps streaming disabled until you enable it.

## Legacy Node.js Edition

The original TypeScript/Node.js and Electron implementation is archived in [`legacy-typescript/`](legacy-typescript/). It remains available for compatibility and historical reference, but is not required for the Rust build. To run it:

```powershell
cd legacy-typescript
npm.cmd install
npm.cmd run build
npm.cmd test
```

## Security

- Use HTTPS for remote endpoints.
- API keys are never included in JSON or Markdown reports.
- Requests use a minimal prompt and low output limits, but provider usage charges may still apply.
- Do not paste API keys into issue reports or public logs.

See [`SECURITY.md`](SECURITY.md) for reporting vulnerabilities.

## License

MIT. See [`LICENSE`](LICENSE).

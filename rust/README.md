# LLM API Doctor Rust Edition

This directory contains the native Rust implementation of LLM API Doctor.

## Workspace

- `crates/core`: provider adapters, HTTP diagnostics, SSE parsing, redaction and report rendering
- `crates/cli`: native command-line executable
- `crates/desktop`: native Windows desktop executable built with `eframe`/`egui`

Supported protocols remain:

- OpenAI-compatible Chat Completions
- OpenAI Responses API
- Anthropic Messages
- Google Gemini
- Azure OpenAI Chat Completions

## Build on Windows

Install Rust with the MSVC target and Visual Studio Build Tools with the C++ workload. Then open **Developer PowerShell for VS 2022**:

```powershell
cd rust
cargo check
cargo build --release -p llm-api-doctor
cargo build --release -p llm-api-doctor-desktop
```

The CLI binary is written to `target/release/llm-api-doctor.exe`; the desktop binary is written to `target/release/llm-api-doctor-desktop.exe`.

Streaming is disabled by default. API keys are read only for the active request and are not included in reports.

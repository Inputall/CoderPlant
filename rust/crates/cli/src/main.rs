use anyhow::{Context, Result};
use clap::{Parser, ValueEnum};
use llm_api_doctor_core::{report_json, report_markdown, Config, Provider};
use std::fs;

#[derive(Clone, Debug, ValueEnum)]
enum ProviderArg {
    OpenaiCompatible,
    OpenaiResponses,
    Anthropic,
    Gemini,
    AzureOpenai,
}
impl From<ProviderArg> for Provider {
    fn from(value: ProviderArg) -> Self {
        match value {
            ProviderArg::OpenaiCompatible => Provider::OpenAiCompatible,
            ProviderArg::OpenaiResponses => Provider::OpenAiResponses,
            ProviderArg::Anthropic => Provider::Anthropic,
            ProviderArg::Gemini => Provider::Gemini,
            ProviderArg::AzureOpenai => Provider::AzureOpenAi,
        }
    }
}

#[derive(Clone, Debug, ValueEnum)]
enum Format {
    Terminal,
    Json,
    Markdown,
}

#[derive(Parser, Debug)]
#[command(
    name = "llm-api-doctor",
    version,
    about = "Diagnose LLM API compatibility, streaming and latency"
)]
struct Args {
    #[arg(long, value_enum, default_value = "openai-compatible")]
    provider: ProviderArg,
    #[arg(long)]
    base_url: Option<String>,
    #[arg(long)]
    model: String,
    #[arg(long)]
    api_key_env: Option<String>,
    #[arg(long)]
    api_version: Option<String>,
    #[arg(long, default_value_t = 30)]
    timeout: u64,
    #[arg(long)]
    stream: bool,
    #[arg(long, value_enum, default_value = "terminal")]
    format: Format,
    #[arg(long)]
    output: Option<String>,
}

fn main() -> Result<()> {
    let args = Args::parse();
    let provider: Provider = args.provider.into();
    let base_url = args
        .base_url
        .or_else(|| provider.default_base_url().map(str::to_string))
        .context("--base-url is required for this provider")?;
    let key_env = args
        .api_key_env
        .unwrap_or_else(|| provider.default_key_env().into());
    let api_key = std::env::var(&key_env)
        .with_context(|| format!("missing API key environment variable {key_env}"))?;
    let report = llm_api_doctor_core::run(&Config {
        provider,
        base_url,
        model: args.model,
        api_key,
        api_version: args.api_version,
        timeout_seconds: args.timeout,
        stream: args.stream,
    })?;
    let rendered = match args.format {
        Format::Terminal => render_terminal(&report),
        Format::Json => report_json(&report),
        Format::Markdown => report_markdown(&report),
    };
    if let Some(path) = args.output {
        fs::write(path, &rendered)?;
    } else {
        println!("{rendered}");
    }
    if report.results.iter().any(|r| r.status == "fail") {
        std::process::exit(1);
    }
    Ok(())
}

fn render_terminal(report: &llm_api_doctor_core::Report) -> String {
    let mut out = format!(
        "LLM API Doctor\nProvider: {}\nEndpoint: {}\nModel: {}\n\n",
        report.provider.as_str(),
        report.endpoint,
        report.model
    );
    for item in &report.results {
        out.push_str(&format!(
            "{:<5} {}\n      {}\n",
            item.status.to_uppercase(),
            item.name,
            item.message
        ));
    }
    out
}

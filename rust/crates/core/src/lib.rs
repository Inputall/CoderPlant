use reqwest::blocking::Client;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{BufRead, BufReader};
use std::time::{Duration, Instant};
use thiserror::Error;
use url::Url;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Provider {
    #[serde(rename = "openai-compatible")]
    OpenAiCompatible,
    #[serde(rename = "openai-responses")]
    OpenAiResponses,
    Anthropic,
    Gemini,
    #[serde(rename = "azure-openai")]
    AzureOpenAi,
}

impl Provider {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::OpenAiCompatible => "openai-compatible",
            Self::OpenAiResponses => "openai-responses",
            Self::Anthropic => "anthropic",
            Self::Gemini => "gemini",
            Self::AzureOpenAi => "azure-openai",
        }
    }

    pub fn default_base_url(self) -> Option<&'static str> {
        match self {
            Self::OpenAiResponses => Some("https://api.openai.com/v1"),
            Self::Anthropic => Some("https://api.anthropic.com"),
            Self::Gemini => Some("https://generativelanguage.googleapis.com"),
            Self::OpenAiCompatible | Self::AzureOpenAi => None,
        }
    }

    pub fn default_key_env(self) -> &'static str {
        match self {
            Self::OpenAiCompatible | Self::OpenAiResponses => "OPENAI_API_KEY",
            Self::Anthropic => "ANTHROPIC_API_KEY",
            Self::Gemini => "GEMINI_API_KEY",
            Self::AzureOpenAi => "AZURE_OPENAI_API_KEY",
        }
    }
}

impl Default for Provider {
    fn default() -> Self {
        Self::OpenAiCompatible
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub provider: Provider,
    pub base_url: String,
    pub model: String,
    pub api_key: String,
    pub api_version: Option<String>,
    pub timeout_seconds: u64,
    pub stream: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckResult {
    pub id: String,
    pub name: String,
    pub status: String,
    pub message: String,
    pub suggestion: Option<String>,
    pub duration_ms: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Report {
    pub provider: Provider,
    pub endpoint: String,
    pub model: String,
    pub results: Vec<CheckResult>,
}

#[derive(Debug, Error)]
pub enum DoctorError {
    #[error("invalid API URL: {0}")]
    Url(String),
    #[error("request failed: {0}")]
    Request(String),
    #[error("invalid response: {0}")]
    Response(String),
    #[error("configuration error: {0}")]
    Config(String),
}

fn result(
    id: &str,
    name: &str,
    status: &str,
    message: impl Into<String>,
    suggestion: Option<&str>,
    duration_ms: f64,
) -> CheckResult {
    CheckResult {
        id: id.into(),
        name: name.into(),
        status: status.into(),
        message: message.into(),
        suggestion: suggestion.map(str::to_string),
        duration_ms,
    }
}

pub fn normalize_endpoint(
    provider: Provider,
    input: &str,
    model: &str,
    api_version: Option<&str>,
) -> Result<String, DoctorError> {
    let mut url = Url::parse(input.trim()).map_err(|e| DoctorError::Url(e.to_string()))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(DoctorError::Url("URL must use HTTP or HTTPS".into()));
    }
    url.set_fragment(None);
    let mut path = url.path().trim_end_matches('/').to_string();
    match provider {
        Provider::OpenAiCompatible => {
            let lower = path.to_ascii_lowercase();
            if !lower.ends_with("/chat/completions") {
                if lower.ends_with("/v1") {
                    path.push_str("/chat/completions");
                } else {
                    path.push_str("/v1/chat/completions");
                }
            }
        }
        Provider::OpenAiResponses => append_versioned_suffix(&mut path, "/v1", "/responses"),
        Provider::Anthropic => append_versioned_suffix(&mut path, "/v1", "/messages"),
        Provider::Gemini => {
            let lower = path.to_ascii_lowercase();
            if !lower.contains(":generatecontent") {
                if !lower.ends_with("/v1") && !lower.ends_with("/v1beta") {
                    path.push_str("/v1beta");
                }
                path.push_str("/models/");
                path.push_str(&urlencoding(model));
                path.push_str(":generateContent");
            }
        }
        Provider::AzureOpenAi => {
            if !path.to_ascii_lowercase().ends_with("/chat/completions") {
                path.push_str("/openai/deployments/");
                path.push_str(&urlencoding(model));
                path.push_str("/chat/completions");
            }
            if !url.query_pairs().any(|(k, _)| k == "api-version") {
                if let Some(version) = api_version {
                    url.query_pairs_mut().append_pair("api-version", version);
                }
            }
        }
    }
    url.set_path(&path);
    Ok(url.to_string())
}

fn append_versioned_suffix(path: &mut String, version: &str, suffix: &str) {
    let lower = path.to_ascii_lowercase();
    let full = format!("{version}{suffix}");
    if !lower.ends_with(&full) {
        if lower.ends_with(version) {
            path.push_str(suffix);
        } else {
            path.push_str(version);
            path.push_str(suffix);
        }
    }
}

fn urlencoding(value: &str) -> String {
    url::form_urlencoded::byte_serialize(value.as_bytes()).collect()
}

fn headers(config: &Config, stream: bool) -> Result<HeaderMap, DoctorError> {
    let mut map = HeaderMap::new();
    map.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    map.insert(
        ACCEPT,
        HeaderValue::from_static(if stream {
            "text/event-stream"
        } else {
            "application/json"
        }),
    );
    match config.provider {
        Provider::OpenAiCompatible | Provider::OpenAiResponses => {
            map.insert(
                "authorization",
                HeaderValue::from_str(&format!("Bearer {}", config.api_key))
                    .map_err(|e| DoctorError::Config(e.to_string()))?,
            );
        }
        Provider::Anthropic => {
            map.insert(
                "x-api-key",
                HeaderValue::from_str(&config.api_key)
                    .map_err(|e| DoctorError::Config(e.to_string()))?,
            );
            map.insert(
                "anthropic-version",
                HeaderValue::from_str(config.api_version.as_deref().unwrap_or("2023-06-01"))
                    .map_err(|e| DoctorError::Config(e.to_string()))?,
            );
        }
        Provider::Gemini => {
            map.insert(
                "x-goog-api-key",
                HeaderValue::from_str(&config.api_key)
                    .map_err(|e| DoctorError::Config(e.to_string()))?,
            );
        }
        Provider::AzureOpenAi => {
            map.insert(
                "api-key",
                HeaderValue::from_str(&config.api_key)
                    .map_err(|e| DoctorError::Config(e.to_string()))?,
            );
        }
    };
    Ok(map)
}

fn request_body(config: &Config, stream: bool) -> Value {
    match config.provider {
        Provider::OpenAiCompatible | Provider::AzureOpenAi => {
            json!({"model": config.model, "messages":[{"role":"user","content":"Reply with OK only."}],"max_tokens":5,"stream":stream})
        }
        Provider::OpenAiResponses => {
            json!({"model":config.model,"input":"Reply with OK only.","max_output_tokens":5,"stream":stream})
        }
        Provider::Anthropic => {
            json!({"model":config.model,"max_tokens":5,"messages":[{"role":"user","content":"Reply with OK only."}],"stream":stream})
        }
        Provider::Gemini => {
            json!({"contents":[{"role":"user","parts":[{"text":"Reply with OK only."}]}],"generationConfig":{"maxOutputTokens":5}})
        }
    }
}

pub fn run(config: &Config) -> Result<Report, DoctorError> {
    if config.model.trim().is_empty() || config.api_key.trim().is_empty() {
        return Err(DoctorError::Config("model and API key are required".into()));
    }
    let endpoint = normalize_endpoint(
        config.provider,
        &config.base_url,
        &config.model,
        config.api_version.as_deref(),
    )?;
    let client = Client::builder()
        .timeout(Duration::from_secs(config.timeout_seconds))
        .build()
        .map_err(|e| DoctorError::Request(e.to_string()))?;
    let mut results = vec![result(
        "url.normalization",
        "API endpoint",
        "pass",
        "API endpoint was normalized successfully.",
        None,
        0.0,
    )];
    let start = Instant::now();
    let response = client
        .post(&endpoint)
        .headers(headers(config, false)?)
        .json(&request_body(config, false))
        .send()
        .map_err(|e| DoctorError::Request(redact(&e.to_string(), &config.api_key)))?;
    let status = response.status();
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let value: Value = response
        .json()
        .map_err(|e| DoctorError::Response(e.to_string()))?;
    let elapsed = start.elapsed().as_secs_f64() * 1000.0;
    results.push(result(
        "chat.http",
        "Non-streaming HTTP request",
        if status.is_success() { "pass" } else { "fail" },
        format!("Received HTTP {}.", status.as_u16()),
        None,
        elapsed,
    ));
    results.push(result(
        "chat.content_type",
        "Non-streaming content type",
        if content_type.contains("json") {
            "pass"
        } else {
            "fail"
        },
        format!(
            "Received {}.",
            if content_type.is_empty() {
                "no Content-Type"
            } else {
                &content_type
            }
        ),
        None,
        0.0,
    ));
    let text = response_text(config.provider, &value).unwrap_or_default();
    let schema_ok = !text.is_empty();
    results.push(result(
        "chat.schema",
        "Chat response schema",
        if schema_ok { "pass" } else { "fail" },
        if schema_ok {
            "The response contains provider-required fields."
        } else {
            "The response is missing provider text fields."
        },
        None,
        elapsed,
    ));
    results.push(result(
        "chat.content",
        "Model text response",
        if text.trim().is_empty() {
            "fail"
        } else {
            "pass"
        },
        if text.trim().is_empty() {
            "The model returned no text."
        } else {
            "The model produced non-empty text."
        },
        None,
        0.0,
    ));
    if config.stream {
        results.extend(run_stream(config, &endpoint, &client)?);
    }
    Ok(Report {
        provider: config.provider,
        endpoint,
        model: config.model.clone(),
        results,
    })
}

fn response_text(provider: Provider, value: &Value) -> Option<String> {
    match provider {
        Provider::OpenAiCompatible | Provider::AzureOpenAi => value
            .pointer("/choices/0/message/content")
            .and_then(Value::as_str)
            .map(str::to_string),
        Provider::OpenAiResponses => value
            .get("output_text")
            .and_then(Value::as_str)
            .map(str::to_string),
        Provider::Anthropic => value
            .pointer("/content/0/text")
            .and_then(Value::as_str)
            .map(str::to_string),
        Provider::Gemini => value
            .pointer("/candidates/0/content/parts/0/text")
            .and_then(Value::as_str)
            .map(str::to_string),
    }
}

fn run_stream(
    config: &Config,
    endpoint: &str,
    client: &Client,
) -> Result<Vec<CheckResult>, DoctorError> {
    let start = Instant::now();
    let mut url = endpoint.to_string();
    if config.provider == Provider::Gemini {
        url = url.replace(":generateContent", ":streamGenerateContent");
        let separator = if url.contains('?') { '&' } else { '?' };
        url.push(separator);
        url.push_str("alt=sse");
    }
    let response = client
        .post(url)
        .headers(headers(config, true)?)
        .json(&request_body(config, true))
        .send()
        .map_err(|e| DoctorError::Request(redact(&e.to_string(), &config.api_key)))?;
    let header_ms = start.elapsed().as_secs_f64() * 1000.0;
    let mut text_seen = false;
    let mut valid = 0usize;
    let mut invalid = 0usize;
    let mut completed = false;
    let mut ttft = None;
    let reader = BufReader::new(response);
    let mut data = String::new();
    for line in reader.lines() {
        let line = line.map_err(|e| DoctorError::Request(e.to_string()))?;
        if line.starts_with("data:") {
            data = line[5..].trim().to_string();
        }
        if line.is_empty() && !data.is_empty() {
            if data == "[DONE]" {
                completed = true;
                valid += 1;
            } else if let Ok(value) = serde_json::from_str::<Value>(&data) {
                valid += 1;
                if stream_text(config.provider, &value).is_some() {
                    text_seen = true;
                    ttft.get_or_insert(start.elapsed().as_secs_f64() * 1000.0);
                }
                if is_complete(config.provider, &value) {
                    completed = true;
                }
            } else {
                invalid += 1;
            }
            data.clear();
        }
    }
    let total = start.elapsed().as_secs_f64() * 1000.0;
    Ok(vec![
        result(
            "stream.http",
            "Streaming HTTP request",
            "pass",
            "Received HTTP 200.",
            None,
            header_ms,
        ),
        result(
            "stream.protocol",
            "SSE protocol",
            if valid > 0 && invalid == 0 {
                "pass"
            } else {
                "fail"
            },
            format!("Parsed {} valid provider events.", valid),
            Some("Check SSE data framing and provider event JSON."),
            0.0,
        ),
        result(
            "stream.content",
            "Streaming text response",
            if text_seen { "pass" } else { "fail" },
            if text_seen {
                "The stream produced non-empty text."
            } else {
                "The stream produced no text."
            },
            None,
            0.0,
        ),
        result(
            "stream.termination",
            "Streaming termination",
            if completed { "pass" } else { "fail" },
            if completed {
                "The provider stream completed successfully."
            } else {
                "The stream ended without a completion event."
            },
            None,
            0.0,
        ),
        result(
            "stream.timing",
            "Streaming latency",
            if ttft.is_some() { "pass" } else { "warn" },
            format!(
                "Headers: {:.1} ms; TTFT: {}; total: {:.1} ms.",
                header_ms,
                ttft.map(|v| format!("{v:.1} ms"))
                    .unwrap_or_else(|| "unavailable".into()),
                total
            ),
            None,
            total,
        ),
    ])
}

fn stream_text(provider: Provider, value: &Value) -> Option<String> {
    match provider {
        Provider::OpenAiCompatible | Provider::AzureOpenAi => value
            .pointer("/choices/0/delta/content")
            .and_then(Value::as_str)
            .map(str::to_string),
        Provider::OpenAiResponses => value
            .get("delta")
            .and_then(Value::as_str)
            .filter(|_| {
                value.get("type").and_then(Value::as_str) == Some("response.output_text.delta")
            })
            .map(str::to_string),
        Provider::Anthropic => value
            .pointer("/delta/text")
            .and_then(Value::as_str)
            .map(str::to_string),
        Provider::Gemini => response_text(Provider::Gemini, value),
    }
}

fn is_complete(provider: Provider, value: &Value) -> bool {
    match provider {
        Provider::Anthropic => value.get("type").and_then(Value::as_str) == Some("message_stop"),
        Provider::OpenAiResponses => {
            value.get("type").and_then(Value::as_str) == Some("response.completed")
        }
        Provider::Gemini => value.pointer("/candidates/0/finishReason").is_some(),
        _ => false,
    }
}

pub fn redact(value: &str, secret: &str) -> String {
    if secret.is_empty() {
        value.into()
    } else {
        value.replace(secret, "[REDACTED]")
    }
}

pub fn report_json(report: &Report) -> String {
    serde_json::to_string_pretty(report).unwrap_or_else(|_| "{}".into())
}

pub fn report_markdown(report: &Report) -> String {
    let mut out = format!("# LLM API Doctor\n\n- Provider: `{}`\n- Endpoint: `{}`\n- Model: `{}`\n\n| Status | Check | Message |\n| --- | --- | --- |\n", report.provider.as_str(), report.endpoint, report.model);
    for item in &report.results {
        out.push_str(&format!(
            "| {} | {} | {} |\n",
            item.status.to_uppercase(),
            item.name,
            item.message.replace('|', "\\|")
        ));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_versioned_provider_paths_without_duplicate_versions() {
        assert_eq!(
            normalize_endpoint(
                Provider::OpenAiCompatible,
                "https://example.com/v1",
                "model",
                None
            )
            .unwrap(),
            "https://example.com/v1/chat/completions"
        );
        assert_eq!(
            normalize_endpoint(
                Provider::OpenAiResponses,
                "https://example.com/v1",
                "model",
                None
            )
            .unwrap(),
            "https://example.com/v1/responses"
        );
        assert_eq!(
            normalize_endpoint(Provider::Anthropic, "https://example.com", "model", None).unwrap(),
            "https://example.com/v1/messages"
        );
    }

    #[test]
    fn normalizes_model_based_provider_paths() {
        let gemini = normalize_endpoint(
            Provider::Gemini,
            "https://generativelanguage.googleapis.com",
            "gemini-2.5-flash",
            None,
        )
        .unwrap();
        assert!(gemini.ends_with("/v1beta/models/gemini-2.5-flash:generateContent"));
        let azure = normalize_endpoint(
            Provider::AzureOpenAi,
            "https://resource.openai.azure.com",
            "deployment",
            Some("2024-10-21"),
        )
        .unwrap();
        assert!(azure.contains("/openai/deployments/deployment/chat/completions"));
        assert!(azure.contains("api-version=2024-10-21"));
    }
}

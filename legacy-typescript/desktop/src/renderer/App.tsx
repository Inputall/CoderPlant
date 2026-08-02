import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  EyeOff,
  FileJson2,
  FileText,
  Globe2,
  KeyRound,
  MinusCircle,
  Play,
  RotateCcw,
  Server,
  ShieldCheck,
  Square,
  Stethoscope,
  XCircle
} from "lucide-react";
import type { CheckResult, CheckStatus, DiagnosticReport, ProviderId } from "../../../dist/index.js";
import type { DesktopDiagnosticInput } from "../shared/contracts.js";
import { getDesktopApi } from "./api.js";
import { formatDuration, reportToJson, reportToMarkdown } from "./report-format.js";
import { localizeResult } from "./result-localization.js";

type RunState = "idle" | "running" | "cancelling";
type ResultTab = "checks" | "report";

interface SavedSettings {
  provider: ProviderId;
  baseUrl: string;
  model: string;
  apiVersion: string;
  timeoutSeconds: number;
  testStream: boolean;
}

const defaultSettings: SavedSettings = {
  provider: "openai-compatible",
  baseUrl: "",
  model: "",
  apiVersion: "",
  timeoutSeconds: 30,
  testStream: false
};

interface ProviderOption {
  id: ProviderId;
  label: string;
  defaultBaseUrl: string;
  defaultApiVersion: string;
}

const providerOptions: ProviderOption[] = [
  { id: "openai-compatible", label: "OpenAI-compatible", defaultBaseUrl: "", defaultApiVersion: "" },
  { id: "openai-responses", label: "OpenAI Responses", defaultBaseUrl: "https://api.openai.com/v1", defaultApiVersion: "" },
  { id: "anthropic", label: "Anthropic Messages", defaultBaseUrl: "https://api.anthropic.com", defaultApiVersion: "2023-06-01" },
  { id: "gemini", label: "Google Gemini", defaultBaseUrl: "https://generativelanguage.googleapis.com", defaultApiVersion: "" },
  { id: "azure-openai", label: "Azure OpenAI", defaultBaseUrl: "", defaultApiVersion: "2024-10-21" }
];

function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && providerOptions.some((option) => option.id === value);
}

function readSavedSettings(): SavedSettings {
  try {
    const value = localStorage.getItem("doctor.desktop.settings");
    if (!value) return defaultSettings;
    const parsed = JSON.parse(value) as Partial<SavedSettings>;
    return {
      provider: isProviderId(parsed.provider) ? parsed.provider : "openai-compatible",
      baseUrl: typeof parsed.baseUrl === "string" ? parsed.baseUrl : "",
      model: typeof parsed.model === "string" ? parsed.model : "",
      apiVersion: typeof parsed.apiVersion === "string" ? parsed.apiVersion : "",
      timeoutSeconds: typeof parsed.timeoutSeconds === "number" ? parsed.timeoutSeconds : 30,
      testStream: parsed.testStream === true
    };
  } catch {
    return defaultSettings;
  }
}

function StatusGlyph({ status, size = 18 }: { status: CheckStatus; size?: number }) {
  if (status === "pass") return <CheckCircle2 size={size} aria-hidden="true" />;
  if (status === "fail") return <XCircle size={size} aria-hidden="true" />;
  if (status === "warn") return <AlertTriangle size={size} aria-hidden="true" />;
  return <MinusCircle size={size} aria-hidden="true" />;
}

function ResultRow({ result }: { result: CheckResult }) {
  const hasMore = Boolean(result.suggestion || result.details);
  const localized = localizeResult(result);
  return (
    <div className={`result-row status-${result.status}`}>
      <div className="result-icon"><StatusGlyph status={result.status} /></div>
      <div className="result-copy">
        <div className="result-title-line">
          <div className="result-name"><strong>{result.name}</strong><small>{localized.nameZh}</small></div>
          {result.durationMs !== undefined && <span>{formatDuration(result.durationMs)}</span>}
        </div>
        <p className="result-message-en">{result.message}</p>
        <p className="result-message-zh">{localized.messageZh}</p>
        {hasMore && (
          <details>
            <summary>Details / 详细信息</summary>
            {result.suggestion && <p className="suggestion">{result.suggestion}<br /><span>{localized.suggestionZh}</span></p>}
            {result.details && <pre>{JSON.stringify(result.details, null, 2)}</pre>}
          </details>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function App() {
  const saved = useMemo(readSavedSettings, []);
  const [provider, setProvider] = useState(saved.provider);
  const [baseUrl, setBaseUrl] = useState(saved.baseUrl);
  const [model, setModel] = useState(saved.model);
  const [apiKey, setApiKey] = useState("");
  const [apiVersion, setApiVersion] = useState(saved.apiVersion);
  const [timeoutSeconds, setTimeoutSeconds] = useState(saved.timeoutSeconds);
  const [testStream, setTestStream] = useState(saved.testStream);
  const [showKey, setShowKey] = useState(false);
  const [runState, setRunState] = useState<RunState>("idle");
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [tab, setTab] = useState<ResultTab>("checks");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const running = runState !== "idle";
  const streamTiming = report?.results.find((result) => result.id === "stream.timing")?.details;
  const ttft = typeof streamTiming?.ttftMs === "number" ? streamTiming.ttftMs : undefined;

  useEffect(() => {
    const settings: SavedSettings = { provider, baseUrl, model, apiVersion, timeoutSeconds, testStream };
    localStorage.setItem("doctor.desktop.settings", JSON.stringify(settings));
  }, [provider, baseUrl, model, apiVersion, timeoutSeconds, testStream]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !running) {
        document.querySelector<HTMLFormElement>("#diagnostic-form")?.requestSubmit();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [running]);

  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!baseUrl.trim() || !model.trim() || !apiKey.trim()) {
      setError("API base URL, model ID, and API key are required.");
      return;
    }
    if (!Number.isFinite(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 300) {
      setError("Timeout must be between 1 and 300 seconds.");
      return;
    }

    const input: DesktopDiagnosticInput = {
      provider,
      baseUrl: baseUrl.trim(),
      model: model.trim(),
      apiKey: apiKey.trim(),
      ...(apiVersion.trim() ? { apiVersion: apiVersion.trim() } : {}),
      timeoutSeconds,
      testStream
    };
    setRunState("running");
    setTab("checks");
    try {
      const response = await getDesktopApi().runDiagnostic(input);
      if (response.ok) {
        setReport(response.report);
      } else if (response.cancelled) {
        setNotice("Diagnostic run cancelled.");
      } else {
        setError(response.error);
      }
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Unable to run diagnostics.");
    } finally {
      setRunState("idle");
    }
  }

  async function cancel() {
    setRunState("cancelling");
    await getDesktopApi().cancelDiagnostic();
  }

  async function exportReport(format: "json" | "markdown") {
    if (!report) return;
    setError("");
    setNotice("");
    const content = format === "json" ? reportToJson(report) : reportToMarkdown(report);
    const response = await getDesktopApi().exportReport({ format, content });
    if (response.ok) setNotice(`Report saved to ${response.path}`);
    else if (!response.cancelled) setError(response.error ?? "Unable to export report.");
  }

  function reset() {
    if (running) return;
    setReport(null);
    setError("");
    setNotice("");
    setApiKey("");
  }

  function changeProvider(nextProvider: ProviderId) {
    const previous = providerOptions.find((option) => option.id === provider);
    const next = providerOptions.find((option) => option.id === nextProvider)!;
    setProvider(nextProvider);
    if (!baseUrl || baseUrl === previous?.defaultBaseUrl) setBaseUrl(next.defaultBaseUrl);
    setApiVersion(next.defaultApiVersion);
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <span className="brand-mark"><Stethoscope size={20} aria-hidden="true" /></span>
          <div>
            <h1>LLM API Doctor</h1>
            <span>Desktop</span>
          </div>
        </div>
        <div className="privacy-state"><ShieldCheck size={16} aria-hidden="true" /> Local session</div>
      </header>

      <div className="workspace">
        <aside className="config-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Configuration</span>
              <h2>Connection</h2>
            </div>
            <button className="icon-button" type="button" onClick={reset} disabled={running} title="Reset report and key" aria-label="Reset report and key">
              <RotateCcw size={17} />
            </button>
          </div>

          <form id="diagnostic-form" onSubmit={run}>
            <label className="field">
              <span><Server size={15} /> Provider protocol</span>
              <select value={provider} onChange={(event) => changeProvider(event.target.value as ProviderId)} disabled={running}>
                {providerOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>

            <label className="field">
              <span><Globe2 size={15} /> API base URL</span>
              <input
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="https://api.example.com/v1"
                inputMode="url"
                spellCheck="false"
                disabled={running}
              />
            </label>

            {(provider === "azure-openai" || provider === "anthropic") && (
              <label className="field">
                <span><Activity size={15} /> API version</span>
                <input
                  value={apiVersion}
                  onChange={(event) => setApiVersion(event.target.value)}
                  placeholder={provider === "azure-openai" ? "2024-10-21" : "2023-06-01"}
                  spellCheck="false"
                  disabled={running}
                />
              </label>
            )}

            <label className="field">
              <span><Activity size={15} /> Model ID</span>
              <input
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder="model-id"
                spellCheck="false"
                disabled={running}
              />
            </label>

            <label className="field">
              <span><KeyRound size={15} /> API key</span>
              <div className="password-input">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder="Enter API key"
                  autoComplete="new-password"
                  spellCheck="false"
                  disabled={running}
                />
                <button type="button" onClick={() => setShowKey((value) => !value)} disabled={running} title={showKey ? "Hide API key" : "Show API key"} aria-label={showKey ? "Hide API key" : "Show API key"}>
                  {showKey ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>

            <div className="field-row">
              <label className="field timeout-field">
                <span><Clock3 size={15} /> Timeout</span>
                <div className="unit-input">
                  <input
                    type="number"
                    min="1"
                    max="300"
                    step="1"
                    value={timeoutSeconds}
                    onChange={(event) => setTimeoutSeconds(Number(event.target.value))}
                    disabled={running}
                  />
                  <span>sec</span>
                </div>
              </label>

              <label className="switch-field">
                <span>Streaming</span>
                <input type="checkbox" checked={testStream} onChange={(event) => setTestStream(event.target.checked)} disabled={running} />
                <span className="switch" aria-hidden="true"><span /></span>
              </label>
            </div>

            {error && <div className="message message-error" role="alert"><AlertCircle size={16} /> <span>{error}</span></div>}
            {notice && <div className="message message-notice" role="status"><CheckCircle2 size={16} /> <span>{notice}</span></div>}

            {running ? (
              <button className="primary-button cancel-button" type="button" onClick={cancel} disabled={runState === "cancelling"}>
                <Square size={16} fill="currentColor" />
                {runState === "cancelling" ? "Stopping..." : "Stop diagnostic"}
              </button>
            ) : (
              <button className="primary-button" type="submit">
                <Play size={17} fill="currentColor" /> Run diagnostic
              </button>
            )}
          </form>

          <div className="panel-foot"><ShieldCheck size={15} /> API key is not persisted</div>
        </aside>

        <main className="results-panel">
          {running && !report ? (
            <section className="running-state" aria-live="polite">
              <div className="scan-indicator"><Activity size={28} /></div>
              <h2>Diagnostic in progress</h2>
              <p>Waiting for the API response...</p>
              <div className="progress-track"><span /></div>
            </section>
          ) : report ? (
            <>
              <section className="report-header">
                <div>
                  <div className={`overall-state status-${report.summary.status}`}>
                    <StatusGlyph status={report.summary.status} size={19} />
                    {report.summary.status === "pass" ? "PASS / 通过" : report.summary.status === "warn" ? "WARN / 警告" : "FAIL / 失败"}
                  </div>
                  <h2>{report.model}</h2>
                  <p>{report.provider} · {report.endpoint}</p>
                </div>
                <div className="export-actions">
                  <button type="button" onClick={() => exportReport("json")} title="Export JSON report"><FileJson2 size={16} /> JSON</button>
                  <button type="button" onClick={() => exportReport("markdown")} title="Export Markdown report"><FileText size={16} /> Markdown</button>
                </div>
              </section>

              <section className="stats-strip" aria-label="Diagnostic summary">
                <Stat label="Passed / 通过" value={report.summary.pass} tone="pass" />
                <Stat label="Warnings / 警告" value={report.summary.warn} tone="warn" />
                <Stat label="Failed / 失败" value={report.summary.fail} tone="fail" />
                <Stat label="TTFT / 首字延迟" value={formatDuration(ttft)} />
                <Stat label="Total / 总耗时" value={formatDuration(report.durationMs)} />
              </section>

              <div className="result-toolbar">
                <div className="tabs" role="tablist" aria-label="Report view">
                  <button role="tab" aria-selected={tab === "checks"} className={tab === "checks" ? "active" : ""} onClick={() => setTab("checks")}>Checks / 检查</button>
                  <button role="tab" aria-selected={tab === "report"} className={tab === "report" ? "active" : ""} onClick={() => setTab("report")}>Report / 报告</button>
                </div>
                <span>{new Date(report.finishedAt).toLocaleString()}</span>
              </div>

              {tab === "checks" ? (
                <section className="result-list" aria-label="Diagnostic checks">
                  {report.results.map((item) => <ResultRow key={item.id} result={item} />)}
                </section>
              ) : (
                <section className="raw-report">
                  <div><Download size={15} /> JSON report / JSON 报告</div>
                  <pre>{reportToJson(report)}</pre>
                </section>
              )}
            </>
          ) : (
            <section className="empty-state">
              <div className="empty-icon"><Activity size={30} /></div>
              <h2>No diagnostic report</h2>
              <p>Connection results will appear here.</p>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

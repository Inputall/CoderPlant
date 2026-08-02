export { runDiagnostic } from "./core/runner.js";
export type {
  CheckResult,
  CheckStatus,
  DiagnosticConfig,
  DiagnosticReport,
  DiagnosticSummary,
  ProviderId,
  ReportFormat,
  RequestTimings
} from "./core/types.js";
export { normalizeEndpoint } from "./url/normalize.js";
export { PROVIDER_IDS, getProviderAdapter, isProviderId } from "./providers/index.js";

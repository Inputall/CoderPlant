import type { DiagnosticReport, ProviderId } from "../../../dist/index.js";

export const IPC_CHANNELS = {
  run: "doctor:run",
  cancel: "doctor:cancel",
  export: "doctor:export"
} as const;

export interface DesktopDiagnosticInput {
  provider: ProviderId;
  baseUrl: string;
  model: string;
  apiKey: string;
  apiVersion?: string;
  timeoutSeconds: number;
  testStream: boolean;
}

export type DiagnosticRunResponse =
  | { ok: true; report: DiagnosticReport }
  | { ok: false; cancelled: boolean; error: string };

export interface ExportRequest {
  format: "json" | "markdown";
  content: string;
}

export type ExportResponse =
  | { ok: true; path: string }
  | { ok: false; cancelled: boolean; error?: string };

export interface DesktopApi {
  runDiagnostic: (input: DesktopDiagnosticInput) => Promise<DiagnosticRunResponse>;
  cancelDiagnostic: () => Promise<boolean>;
  exportReport: (request: ExportRequest) => Promise<ExportResponse>;
}

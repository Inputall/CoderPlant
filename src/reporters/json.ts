import type { DiagnosticReport } from "../core/types.js";

export function renderJsonReport(report: DiagnosticReport): string {
  return JSON.stringify(report, null, 2);
}

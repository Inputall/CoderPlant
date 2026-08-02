import type { DiagnosticReport, ReportFormat } from "../core/types.js";
import { renderJsonReport } from "./json.js";
import { renderMarkdownReport } from "./markdown.js";
import { renderTerminalReport } from "./terminal.js";

export function renderReport(report: DiagnosticReport, format: ReportFormat): string {
  if (format === "json") return renderJsonReport(report);
  if (format === "markdown") return renderMarkdownReport(report);
  return renderTerminalReport(report);
}

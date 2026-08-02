import type { DiagnosticReport } from "../core/types.js";

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
}

export function renderMarkdownReport(report: DiagnosticReport): string {
  const rows = report.results.map((result) => {
    const duration = result.durationMs === undefined ? "" : `${result.durationMs} ms`;
    return `| ${escapeCell(result.name)} | ${result.status.toUpperCase()} | ${escapeCell(result.message)} | ${duration} |`;
  });

  return [
    "# LLM API Doctor Report",
    "",
    `- Version: \`${report.version}\``,
    `- Provider: \`${report.provider}\``,
    `- Endpoint: \`${report.endpoint}\``,
    `- Model: \`${report.model}\``,
    `- Started: \`${report.startedAt}\``,
    `- Duration: \`${report.durationMs} ms\``,
    `- Overall status: **${report.summary.status.toUpperCase()}**`,
    "",
    "| Check | Status | Message | Duration |",
    "| --- | --- | --- | ---: |",
    ...rows,
    ""
  ].join("\n");
}

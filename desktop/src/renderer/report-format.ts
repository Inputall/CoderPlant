import type { DiagnosticReport } from "../../../dist/index.js";

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
}

export function reportToJson(report: DiagnosticReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function reportToMarkdown(report: DiagnosticReport): string {
  const rows = report.results.map((result) => {
    const duration = result.durationMs === undefined ? "" : `${result.durationMs} ms`;
    return `| ${escapeCell(result.name)} | ${result.status.toUpperCase()} | ${escapeCell(result.message)} | ${duration} |`;
  });
  return [
    "# LLM API Doctor Report",
    "",
    `- Endpoint: \`${report.endpoint}\``,
    `- Model: \`${report.model}\``,
    `- Started: \`${report.startedAt}\``,
    `- Overall status: **${report.summary.status.toUpperCase()}**`,
    `- Duration: \`${report.durationMs} ms\``,
    "",
    "| Check | Status | Message | Duration |",
    "| --- | --- | --- | ---: |",
    ...rows,
    ""
  ].join("\n");
}

export function formatDuration(value: number | undefined): string {
  if (value === undefined) return "--";
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)} s`;
  return `${Math.round(value)} ms`;
}

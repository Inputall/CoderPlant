import pc from "picocolors";
import type { CheckResult, DiagnosticReport } from "../core/types.js";

function statusLabel(result: CheckResult): string {
  const label = result.status.toUpperCase().padEnd(4);
  if (result.status === "pass") return pc.green(label);
  if (result.status === "fail") return pc.red(label);
  if (result.status === "warn") return pc.yellow(label);
  return pc.dim(label);
}

export function renderTerminalReport(report: DiagnosticReport): string {
  const lines = [
    pc.bold("LLM API Doctor"),
    `Provider: ${report.provider}`,
    `Endpoint: ${report.endpoint}`,
    `Model:    ${report.model}`,
    ""
  ];

  for (const result of report.results) {
    const duration = result.durationMs === undefined ? "" : pc.dim(` (${result.durationMs} ms)`);
    lines.push(`${statusLabel(result)}  ${result.name}${duration}`);
    lines.push(`      ${result.message}`);
    if (result.suggestion) {
      lines.push(pc.dim(`      Suggestion: ${result.suggestion}`));
    }
  }

  const summary = `${report.summary.pass} passed, ${report.summary.warn} warned, ${report.summary.fail} failed, ${report.summary.skip} skipped`;
  const overall = report.summary.status === "pass"
    ? pc.green("PASS")
    : report.summary.status === "warn"
      ? pc.yellow("WARN")
      : pc.red("FAIL");
  lines.push("", `${pc.bold("Overall:")} ${overall} - ${summary}`, `Total duration: ${report.durationMs} ms`);
  return lines.join("\n");
}

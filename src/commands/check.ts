import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import ora from "ora";
import { resolveCheckInput, type CheckCommandOptions } from "../config/input.js";
import { runDiagnostic } from "../core/runner.js";
import { renderReport } from "../reporters/index.js";

export async function executeCheck(options: CheckCommandOptions): Promise<number> {
  const input = await resolveCheckInput(options);
  const useSpinner = input.format === "terminal" && Boolean(process.stderr.isTTY);
  const spinner = useSpinner ? ora("Running API diagnostics").start() : undefined;

  try {
    const report = await runDiagnostic(input.config);
    spinner?.stop();
    const output = renderReport(report, input.format);
    process.stdout.write(`${output}\n`);

    if (input.outputPath) {
      const outputPath = resolve(input.outputPath);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `${output}\n`, { encoding: "utf8" });
    }
    return report.summary.fail > 0 ? 1 : 0;
  } catch (error) {
    spinner?.fail("Diagnostics failed");
    throw error;
  }
}

#!/usr/bin/env node
import { Command, CommanderError, Option } from "commander";
import { executeCheck } from "./commands/check.js";
import { ConfigurationError, type CheckCommandOptions } from "./config/input.js";
import type { ProviderId, ReportFormat } from "./core/types.js";
import { PROVIDER_IDS } from "./providers/index.js";
import { redactText } from "./security/redact.js";
import { VERSION } from "./version.js";

export async function main(argv = process.argv): Promise<void> {
  const program = new Command();
  program
    .name("llm-api-doctor")
    .description("Diagnose OpenAI-compatible, Responses, Anthropic, Gemini, and Azure OpenAI APIs.")
    .version(VERSION)
    .exitOverride();

  program
    .command("check")
    .description("Run compatibility and latency diagnostics.")
    .addOption(new Option("--provider <provider>", "API provider protocol").choices(PROVIDER_IDS).default("openai-compatible"))
    .option("--base-url <url>", "API base URL or full provider endpoint")
    .option("--model <id>", "model ID to test")
    .option("--api-key-env <name>", "environment variable containing the API key")
    .option("--api-version <version>", "provider API version (Azure or Anthropic)")
    .option("--timeout <seconds>", "request timeout in seconds", "30")
    .option("--stream", "also test SSE streaming output")
    .addOption(new Option("--format <format>", "report format").choices(["terminal", "json", "markdown"]).default("terminal"))
    .option("--output <path>", "save the rendered report to a file")
    .option("--non-interactive", "fail instead of prompting for missing values")
    .action(async (rawOptions: Record<string, unknown>, command: Command) => {
      const options: CheckCommandOptions = {
        provider: rawOptions.provider as ProviderId,
        timeout: String(rawOptions.timeout),
        stream: Boolean(rawOptions.stream),
        format: rawOptions.format as ReportFormat,
        nonInteractive: Boolean(rawOptions.nonInteractive),
        streamExplicit: command.getOptionValueSource("stream") === "cli"
      };
      if (typeof rawOptions.baseUrl === "string") options.baseUrl = rawOptions.baseUrl;
      if (typeof rawOptions.model === "string") options.model = rawOptions.model;
      if (typeof rawOptions.apiKeyEnv === "string") options.apiKeyEnv = rawOptions.apiKeyEnv;
      if (typeof rawOptions.apiVersion === "string") options.apiVersion = rawOptions.apiVersion;
      if (typeof rawOptions.output === "string") options.output = rawOptions.output;
      process.exitCode = await executeCheck(options);
    });

  try {
    await program.parseAsync(argv);
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.exitCode !== 0) {
        process.exitCode = 2;
      }
      return;
    }
    const message = error instanceof ConfigurationError || error instanceof Error
      ? error.message
      : "Unexpected CLI failure.";
    process.stderr.write(`Error: ${redactText(message)}\n`);
    process.exitCode = error instanceof ConfigurationError ? 2 : 3;
  }
}

await main();

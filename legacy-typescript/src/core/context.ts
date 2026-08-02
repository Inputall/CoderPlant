import { performance } from "node:perf_hooks";
import type { DiagnosticConfig } from "./types.js";

export interface DiagnosticContext {
  config: DiagnosticConfig;
  startedAt: Date;
  startedAtPerformance: number;
}

export function createDiagnosticContext(config: DiagnosticConfig): DiagnosticContext {
  return {
    config,
    startedAt: new Date(),
    startedAtPerformance: performance.now()
  };
}

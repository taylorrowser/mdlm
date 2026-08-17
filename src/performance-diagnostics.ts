import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";

interface StageMeasurement {
  count: number;
  milliseconds: number;
}

interface MutablePerformanceDiagnostics {
  repository: {
    loads: number;
    markdownFiles: number;
  };
  stages: Map<string, StageMeasurement>;
  work: Map<string, number>;
}

export interface PerformanceDiagnostics {
  contract: "mdlm-performance@1";
  repository: { loads: number; markdownFiles: number };
  stages: Record<string, StageMeasurement>;
  work: Record<string, number>;
}

const commandDiagnostics = new AsyncLocalStorage<MutablePerformanceDiagnostics>();

function emptyDiagnostics(): MutablePerformanceDiagnostics {
  return {
    repository: { loads: 0, markdownFiles: 0 },
    stages: new Map(),
    work: new Map(),
  };
}

function report(diagnostics: MutablePerformanceDiagnostics): PerformanceDiagnostics {
  return {
    contract: "mdlm-performance@1",
    repository: { ...diagnostics.repository },
    stages: Object.fromEntries(
      [...diagnostics.stages.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([stage, measurement]) => [stage, {
          count: measurement.count,
          milliseconds: Number(measurement.milliseconds.toFixed(3)),
        }]),
    ),
    work: Object.fromEntries(
      [...diagnostics.work.entries()].sort(([left], [right]) =>
        left.localeCompare(right)
      ),
    ),
  };
}

export async function collectPerformanceDiagnostics<T>(
  operation: () => Promise<T>,
): Promise<{ value: T; diagnostics: PerformanceDiagnostics }> {
  const diagnostics = emptyDiagnostics();
  const value = await commandDiagnostics.run(diagnostics, operation);
  return { value, diagnostics: report(diagnostics) };
}

export function measure<T>(stage: string, operation: () => T): T {
  const diagnostics = commandDiagnostics.getStore();
  if (!diagnostics) return operation();
  const started = performance.now();
  try {
    return operation();
  } finally {
    recordStage(diagnostics, stage, performance.now() - started);
  }
}

export async function measureAsync<T>(
  stage: string,
  operation: () => Promise<T>,
): Promise<T> {
  const diagnostics = commandDiagnostics.getStore();
  if (!diagnostics) return operation();
  const started = performance.now();
  try {
    return await operation();
  } finally {
    recordStage(diagnostics, stage, performance.now() - started);
  }
}

function recordStage(
  diagnostics: MutablePerformanceDiagnostics,
  stage: string,
  milliseconds: number,
): void {
  const current = diagnostics.stages.get(stage) ?? {
    count: 0,
    milliseconds: 0,
  };
  current.count += 1;
  current.milliseconds += milliseconds;
  diagnostics.stages.set(stage, current);
}

export function recordWork(name: string, amount = 1): void {
  const diagnostics = commandDiagnostics.getStore();
  if (!diagnostics) return;
  diagnostics.work.set(name, (diagnostics.work.get(name) ?? 0) + amount);
}

export function recordRepositoryLoad(markdownFiles: number): void {
  const diagnostics = commandDiagnostics.getStore();
  if (!diagnostics) return;
  diagnostics.repository.loads += 1;
  diagnostics.repository.markdownFiles += markdownFiles;
}

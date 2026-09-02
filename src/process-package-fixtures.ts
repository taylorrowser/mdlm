import { promises as fs } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import {
  loadProcessPackage,
  type ProcessDiagnostic,
  type ProcessPackage,
  type VersionedDefinition,
} from "./index.js";

type CaseKind = "phase-admission" | "discriminated-output";

export interface ProcessTestSummary {
  passed: number;
  failed: number;
  cases: {
    name: string;
    kind: CaseKind;
    passed: boolean;
    diagnostics: ProcessDiagnostic[];
  }[];
}

type Result<T> =
  | { ok: true; value: T }
  | { ok: false; diagnostics: ProcessDiagnostic[] };

interface PhaseAdmissionCase {
  kind: "phase-admission";
  phase: string;
  selector: string;
}

interface DiscriminatedOutputCase {
  kind: "discriminated-output";
  scenario: string;
  output: string;
  types: string[];
  typeFrom: { input: string; path: string };
}

type ProcessCase = PhaseAdmissionCase | DiscriminatedOutputCase;

interface LoadedCase {
  name: string;
  source: string;
  value: ProcessCase;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function diagnostic(
  code: string,
  source: string,
  message: string,
): ProcessDiagnostic {
  return { code, path: source, message };
}

async function loadCase(root: string, name: string): Promise<Result<LoadedCase>> {
  const source = path.join(root, "cases", name, "case.yaml");
  try {
    const declaration = record(parse(await fs.readFile(source, "utf8")));
    if (
      declaration?.kind === "phase-admission" &&
      typeof declaration.phase === "string" &&
      typeof declaration.selector === "string"
    ) {
      return {
        ok: true,
        value: {
          name,
          source,
          value: {
            kind: declaration.kind,
            phase: declaration.phase,
            selector: declaration.selector,
          },
        },
      };
    }
    const typeFrom = record(declaration?.type_from);
    if (
      declaration?.kind === "discriminated-output" &&
      typeof declaration.scenario === "string" &&
      typeof declaration.output === "string" &&
      Array.isArray(declaration.types) &&
      declaration.types.length > 0 &&
      declaration.types.every((type) => typeof type === "string") &&
      typeof typeFrom?.input === "string" &&
      typeof typeFrom.path === "string"
    ) {
      return {
        ok: true,
        value: {
          name,
          source,
          value: {
            kind: declaration.kind,
            scenario: declaration.scenario,
            output: declaration.output,
            types: declaration.types as string[],
            typeFrom: { input: typeFrom.input, path: typeFrom.path },
          },
        },
      };
    }
    return {
      ok: false,
      diagnostics: [diagnostic(
        "process-case-invalid",
        source,
        `Case '${name}' must declare one supported semantic contract`,
      )],
    };
  } catch (error) {
    return {
      ok: false,
      diagnostics: [diagnostic(
        "process-case-invalid",
        source,
        error instanceof Error ? error.message : String(error),
      )],
    };
  }
}

function definition(
  definitions: Record<string, VersionedDefinition>,
  reference: string,
): VersionedDefinition | undefined {
  const separator = reference.lastIndexOf("@");
  const id = separator > 0 ? reference.slice(0, separator) : reference;
  const version = separator > 0 ? Number(reference.slice(separator + 1)) : NaN;
  const candidate = definitions[id];
  return candidate && candidate.version === version ? candidate : undefined;
}

function referencesSelector(expression: unknown, selector: string): boolean {
  if (Array.isArray(expression)) {
    return expression.some((value) => referencesSelector(value, selector));
  }
  const value = record(expression);
  if (!value) return false;
  if (
    value.reference === selector &&
    (value.kind === "selector" || value.kind === "every")
  ) return true;
  return Object.values(value).some((nested) =>
    referencesSelector(nested, selector)
  );
}

function phaseAdmissionDiagnostics(
  processPackage: ProcessPackage,
  testCase: LoadedCase & { value: PhaseAdmissionCase },
): ProcessDiagnostic[] {
  const phase = definition(processPackage.phases, testCase.value.phase);
  const progression = record(phase?.progression);
  const nextPhaseId = progression?.next_phase;
  const nextPhase = typeof nextPhaseId === "string"
    ? processPackage.phases[nextPhaseId]
    : undefined;
  if (
    phase &&
    nextPhase &&
    referencesSelector(progression?.readiness, testCase.value.selector) &&
    referencesSelector(nextPhase.entry, testCase.value.selector)
  ) return [];
  return [diagnostic(
    "process-case-phase-admission-mismatch",
    `${testCase.source}#selector`,
    `Phase '${testCase.value.phase}' progression and its next Phase entry must both reference '${testCase.value.selector}'`,
  )];
}

function sameStrings(left: string[], right: string[]): boolean {
  const sortedRight = [...right].sort();
  return left.length === right.length &&
    [...left].sort().every((value, index) => value === sortedRight[index]);
}

function discriminatedOutputDiagnostics(
  processPackage: ProcessPackage,
  testCase: LoadedCase & { value: DiscriminatedOutputCase },
): ProcessDiagnostic[] {
  const scenario = definition(processPackage.scenarios, testCase.value.scenario);
  const outputs = Array.isArray(scenario?.outputs) ? scenario.outputs : [];
  const typedOutputs = outputs.filter((value) => {
    const output = record(value);
    return Array.isArray(output?.types) &&
      output.types.some((type) => testCase.value.types.includes(String(type)));
  });
  const output = typedOutputs.length === 1 ? record(typedOutputs[0]) : undefined;
  const typeFrom = record(output?.type_from);
  const types = Array.isArray(output?.types)
    ? output.types.filter((type): type is string => typeof type === "string")
    : [];
  if (
    output?.name === testCase.value.output &&
    sameStrings(types, testCase.value.types) &&
    typeFrom?.input === testCase.value.typeFrom.input &&
    typeFrom.path === testCase.value.typeFrom.path
  ) return [];
  return [diagnostic(
    "process-case-discriminated-output-mismatch",
    `${testCase.source}#output`,
    `Scenario '${testCase.value.scenario}' must route ${testCase.value.types.join(" and ")} through one '${testCase.value.output}' output discriminated by ${testCase.value.typeFrom.input}.${testCase.value.typeFrom.path}`,
  )];
}

/** Load one Process Package and test its declared cross-definition contracts. */
export async function testProcessPackage(
  root: string,
): Promise<Result<ProcessTestSummary>> {
  const loaded = await loadProcessPackage(root);
  if (!loaded.ok) return { ok: false, diagnostics: loaded.diagnostics };
  const casesRoot = path.join(root, "cases");
  const names = await exists(casesRoot)
    ? (await fs.readdir(casesRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
    : [];
  const packageHasBehavior = [
    loaded.package.phases,
    loaded.package.obligations,
    loaded.package.scenarios,
  ].some((definitions) => Object.keys(definitions).length > 0);
  if (names.length === 0 && packageHasBehavior) {
    return {
      ok: false,
      diagnostics: [diagnostic(
        "process-cases-empty",
        casesRoot,
        "A Process Package with Phases, Obligations, or Scenarios must declare at least one semantic case",
      )],
    };
  }

  const parsed = await Promise.all(names.map((name) => loadCase(root, name)));
  const cases: ProcessTestSummary["cases"] = parsed.map((result, index) => {
    if (!result.ok) {
      return {
        name: names[index]!,
        kind: "phase-admission" as const,
        passed: false,
        diagnostics: result.diagnostics,
      };
    }
    const testCase = result.value;
    const diagnostics = testCase.value.kind === "phase-admission"
      ? phaseAdmissionDiagnostics(
        loaded.package,
        testCase as LoadedCase & { value: PhaseAdmissionCase },
      )
      : discriminatedOutputDiagnostics(
        loaded.package,
        testCase as LoadedCase & { value: DiscriminatedOutputCase },
      );
    return {
      name: testCase.name,
      kind: testCase.value.kind,
      passed: diagnostics.length === 0,
      diagnostics,
    };
  });
  return {
    ok: true,
    value: {
      passed: cases.filter((testCase) => testCase.passed).length,
      failed: cases.filter((testCase) => !testCase.passed).length,
      cases,
    },
  };
}

import {
  loadProcessPackage,
  type ProcessConstraintKind,
  type ProcessConstraintStatus,
  type ProcessDiagnostic,
} from "./index.js";

export interface ProcessTestSummary {
  passed: number;
  failed: number;
  cases: {
    name: string;
    kind: ProcessConstraintKind;
    status: ProcessConstraintStatus;
    passed: boolean;
    diagnostics: ProcessDiagnostic[];
  }[];
}

type Result<T> =
  | { ok: true; value: T }
  | { ok: false; diagnostics: ProcessDiagnostic[] };

/** Load one Process Package and report its compiled declaration proofs. */
export async function testProcessPackage(
  root: string,
): Promise<Result<ProcessTestSummary>> {
  const loaded = await loadProcessPackage(root);
  if (!loaded.ok) return { ok: false, diagnostics: loaded.diagnostics };
  const contract = loaded.package.constraintContract;
  if (!contract) {
    return {
      ok: false,
      diagnostics: [{
        code: "process-constraint-compilation-missing",
        path: root,
        message: "The Process Package has no compiled constraint contract",
      }],
    };
  }
  const cases = contract.checks.map((check) => ({
    name: check.name,
    kind: check.kind,
    status: check.status,
    passed: check.status === "proved",
    diagnostics: check.diagnostics,
  }));
  return {
    ok: true,
    value: {
      passed: cases.filter((testCase) => testCase.passed).length,
      failed: cases.filter((testCase) => !testCase.passed).length,
      cases,
    },
  };
}

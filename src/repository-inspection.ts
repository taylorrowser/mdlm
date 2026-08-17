import type { ProcessPackage } from "./index.js";
import type { BaselineRepositoryVerification } from "./exact-baseline-repository.js";
import { verifyRepositoryBaselinesData } from "./exact-baseline-repository.js";
import {
  readRepositoryData,
  rebuildRepositoryIndexData,
  rebuildRepositoryReportData,
  repositoryLifecycleSnapshotData,
  type RepositoryIndexSummary,
  type RepositoryReportSummary,
  type RepositoryResult,
} from "./lifecycle-repository.js";
import type { LifecycleSnapshot } from "./index.js";
import { measureAsync } from "./performance-diagnostics.js";

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

export interface GeneratedRepositoryProjections {
  index: RepositoryIndexSummary;
  report: RepositoryReportSummary;
}

/**
 * One immutable, verified view of authoritative repository Markdown for a command.
 * Expensive discovery, parsing, provenance, and whole-graph validation stay behind
 * this interface and are shared by all downstream inspection operations.
 */
export interface RepositoryInspection {
  lifecycleSnapshot(phaseId: string): LifecycleSnapshot;
  verifyBaselines(): Promise<RepositoryResult<BaselineRepositoryVerification>>;
  rebuildGeneratedProjections(): Promise<
    RepositoryResult<GeneratedRepositoryProjections>
  >;
}

export async function loadRepositoryInspection(
  root: string,
  processPackage: ProcessPackage,
  processReference: string,
): Promise<RepositoryResult<RepositoryInspection>> {
  const loaded = await readRepositoryData(root, processPackage);
  if (!loaded.ok) return loaded;
  const parsed = deepFreeze(loaded.value);
  let baselineVerification:
    Promise<RepositoryResult<BaselineRepositoryVerification>> | undefined;

  return {
    ok: true,
    value: {
      lifecycleSnapshot(phaseId) {
        const snapshot = repositoryLifecycleSnapshotData(
          parsed,
          processReference,
          phaseId,
        );
        if (!snapshot.ok)
          throw new Error("Verified repository snapshot unavailable");
        return snapshot.value;
      },
      verifyBaselines() {
        baselineVerification ??= measureAsync("baseline.verification", () =>
          verifyRepositoryBaselinesData(
            root,
            processPackage,
            processReference,
            parsed,
          ),
        );
        return baselineVerification;
      },
      async rebuildGeneratedProjections() {
        const [index, report] = await measureAsync(
          "repository.generated-projections",
          () =>
            Promise.all([
              measureAsync("repository.index-rebuild", () =>
                rebuildRepositoryIndexData(
                  root,
                  `${processPackage.manifest.id}@${processPackage.manifest.version}`,
                  parsed,
                ),
              ),
              measureAsync("repository.report-rebuild", () =>
                rebuildRepositoryReportData(
                  root,
                  processPackage,
                  processReference,
                  parsed,
                ),
              ),
            ]),
        );
        if (!index.ok) return index;
        if (!report.ok) return report;
        return {
          ok: true,
          value: { index: index.value, report: report.value },
          diagnostics: [],
        };
      },
    },
    diagnostics: [],
  };
}

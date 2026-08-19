import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { DatumEnvelope, ProcessPackage } from "./index.js";
import type {
  BaselineFreeze,
  BaselineRepositoryVerification,
  BaselineVerificationCache,
} from "./exact-baseline-repository.js";
import {
  finalizeExactBaselineScenarioOutputData,
  verifyRepositoryBaselinesData,
} from "./exact-baseline-repository.js";
import {
  deriveLifecycleRecordStorage,
  readRepositoryData,
  publishScenarioMutationData,
  rebuildRepositoryIndexData,
  rebuildRepositoryReportData,
  repositoryLifecycleSnapshotData,
  verifyRepositoryDataSources,
  type KernelFinalizedScenarioOutput,
  type ParsedDatum,
  type RepositoryIndexSummary,
  type RepositoryReportSummary,
  type RepositoryResult,
  type ScenarioMutationPublication,
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

/** Mutable publication overlay owned by one command transaction. */
export interface RepositoryTransaction {
  finalizeExactBaseline(proposedDatum: DatumEnvelope): Promise<RepositoryResult<{
    output: KernelFinalizedScenarioOutput;
    freeze: BaselineFreeze;
  }>>;
  publishScenarioMutation(
    expectedData: DatumEnvelope[],
    data: DatumEnvelope[],
    executionId: string,
    executionRecord: unknown,
    kernelFinalizedOutputs?: readonly KernelFinalizedScenarioOutput[],
  ): Promise<RepositoryResult<ScenarioMutationPublication>>;
}

/**
 * One immutable, verified view of authoritative repository Markdown for a command.
 * Expensive discovery, parsing, provenance, and whole-graph validation stay behind
 * this interface and are shared by all downstream inspection operations.
 */
export interface RepositoryInspection {
  lifecycleSnapshot(phaseId: string): LifecycleSnapshot;
  beginTransaction(): RepositoryTransaction;
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
  const baselineVerificationCache: BaselineVerificationCache = new Map();

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
      beginTransaction() {
        const published: ParsedDatum[] = [];
        const currentData = () => [...parsed, ...published];
        return {
          finalizeExactBaseline(proposedDatum) {
            return finalizeExactBaselineScenarioOutputData(
              root,
              processPackage,
              processReference,
              currentData(),
              proposedDatum,
              baselineVerificationCache,
            );
          },
          async publishScenarioMutation(
            expectedData,
            data,
            executionId,
            executionRecord,
            kernelFinalizedOutputs = [],
          ) {
            const before = currentData();
            const result = await publishScenarioMutationData(
              root,
              processPackage,
              before,
              expectedData,
              data,
              executionId,
              executionRecord,
              kernelFinalizedOutputs,
              () => verifyRepositoryDataSources(root, before),
            );
            if (!result.ok) return result;
            const stored = deriveLifecycleRecordStorage(processPackage, [
              ...before.map((item) => item.lifecycleDatum),
              ...data.map((datum) => ({
                datum,
                storage: { editable: true, frozen: false },
                integrity: {
                  parseable: true,
                  schema_valid: true,
                  identity_valid: true,
                  references_valid: true,
                  hash_valid: true,
                  scenario_execution_valid: true,
                },
              })),
            ]).slice(-data.length);
            for (const [index, datum] of data.entries()) {
              const created = result.value.created[index]!;
              const source = await fs.readFile(path.join(root, created.path));
              published.push(deepFreeze({
                lifecycleDatum: stored[index]!,
                relativePath: created.path,
                sourceDigest: `sha256:${createHash("sha256").update(source).digest("hex")}`,
              }));
            }
            return result;
          },
        };
      },
      verifyBaselines() {
        baselineVerification ??= measureAsync("baseline.verification", () =>
          verifyRepositoryBaselinesData(
            root,
            processPackage,
            processReference,
            parsed,
            baselineVerificationCache,
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

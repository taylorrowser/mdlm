import assert from "node:assert/strict";
import test from "node:test";
import {
  PR_QUALIFICATION_BUDGET_MS,
  QUALIFICATION_GATES,
  RELEASE_QUALIFICATION_BUDGET_MS,
  parseQualificationArguments,
  qualificationManifestErrors,
  rootTestFilesForGate,
} from "./qualification-gates.mjs";
import { createRootTestTasksForGate } from "./root-test-schedule.mjs";
import { QUALIFICATION_GATE_TIMING_EVIDENCE } from "./qualification-gate-evidence.mjs";
import {
  rootTestManifest,
  rootTestQualificationManifest,
} from "../vitest.suites.mjs";

const releaseOnlyRootFiles = [
  "test/initial-product-intent-resolution.test.ts",
  "test/initial-product-intent-route.test.ts",
  "test/mdlm-assignment-state.test.ts",
  "test/mdlm-assignment.test.ts",
  "test/mdlm-baseline-inspection.test.ts",
  "test/mdlm-clean-onboarding-transaction.test.ts",
  "test/mdlm-clean-pilot-contract.test.ts",
  "test/mdlm-init.test.ts",
  "test/mdlm-lifecycle.test.ts",
  "test/mdlm-pilot-assessment.test.ts",
  "test/mdlm-process-expression.test.ts",
  "test/mdlm-process-migration.test.ts",
  "test/mdlm-repository-inspection.test.ts",
  "test/mdlm-review-assignment.test.ts",
  "test/mdlm-schema.test.ts",
  "test/operator-outcome.test.ts",
  "test/phase-0-corrected-gate-route.test.ts",
  "test/phase-0-intent-candidate-currentness-route.test.ts",
  "test/phase-1-hardening-routes.test.ts",
  "test/phase-2-hardening-routes.test.ts",
  "test/proportional-distinct-context-phase-2-public.test.ts",
  "test/selected-package-cache.test.ts",
].sort();

const taskFiles = (tasks) => tasks.flatMap((task) => task.files).sort();

test("the PR authority has a ten-minute bound and release retains the complete root inventory", () => {
  assert.equal(PR_QUALIFICATION_BUDGET_MS, 600_000);
  assert.equal(RELEASE_QUALIFICATION_BUDGET_MS, 2_400_000);

  const prFiles = rootTestFilesForGate(QUALIFICATION_GATES.PR);
  const releaseFiles = rootTestFilesForGate(QUALIFICATION_GATES.RELEASE);
  assert.equal(prFiles.length, 25);
  assert.deepEqual(releaseFiles, rootTestManifest.map((entry) => entry.file));
  assert.deepEqual(
    rootTestManifest
      .filter((entry) => entry.qualificationGate === QUALIFICATION_GATES.RELEASE)
      .map((entry) => entry.file)
      .sort(),
    releaseOnlyRootFiles,
  );
  assert.ok(prFiles.includes("test/load-process-package.test.ts"));
  assert.ok(prFiles.includes("test/mdlm-command-application.test.ts"));
  assert.ok(prFiles.includes("test/phase-hardening-matrix.test.ts"));
});

test("successful PR timing is immutable evidence and does not absorb censored runs", () => {
  assert.deepEqual(QUALIFICATION_GATE_TIMING_EVIDENCE.failedOrCensored, []);
  assert.deepEqual(
    QUALIFICATION_GATE_TIMING_EVIDENCE.successful.map((entry) => ({
      contentTree: entry.contentTree,
      rootFiles: entry.rootFiles,
      status: entry.status,
      wallMs: entry.wallMs,
    })),
    [{
      contentTree: "749fcd81d6d2ada87532a52a64acc2cbd948d5af",
      rootFiles: 25,
      status: 0,
      wallMs: 492_870,
    }],
  );
});

test("the source qualification manifest classifies every runtime file exactly once", () => {
  const discovered = rootTestManifest.map((entry) => entry.file);
  assert.equal(rootTestQualificationManifest.length, 47);
  assert.deepEqual(
    qualificationManifestErrors(discovered, rootTestQualificationManifest),
    [],
  );
});

test("qualification classification rejects missing, duplicate, stale, and invalid entries", () => {
  const discovered = ["test/a.test.ts", "test/b.test.ts"];
  assert.deepEqual(
    qualificationManifestErrors(discovered, [
      { file: "test/a.test.ts", qualificationGate: QUALIFICATION_GATES.PR },
      { file: "test/a.test.ts", qualificationGate: QUALIFICATION_GATES.RELEASE },
      { file: "test/stale.test.ts", qualificationGate: "other" },
    ]),
    [
      "Root qualification file is classified more than once: test/a.test.ts",
      "Unclassified root qualification file: test/b.test.ts",
      "Stale root qualification classification: test/stale.test.ts",
      "Invalid root qualification gate other: test/stale.test.ts",
    ],
  );
});

test("the PR gate can add diff-focused public-boundary files without weakening release authority", () => {
  const focused = "test/phase-1-hardening-routes.test.ts";
  const parsed = parseQualificationArguments([
    "--gate=pr",
    `--root-test=${focused}`,
  ]);
  assert.deepEqual(parsed, {
    gate: QUALIFICATION_GATES.PR,
    additionalRootTestFiles: [focused],
  });
  assert.ok(rootTestFilesForGate(parsed.gate, parsed.additionalRootTestFiles).includes(focused));
  assert.throws(
    () => parseQualificationArguments(["--gate=release", `--root-test=${focused}`]),
    /Diff-focused root tests are valid only for the PR gate/,
  );
  assert.throws(
    () => parseQualificationArguments(["--gate=pr", "--root-test=test/not-classified.test.ts"]),
    /Unknown root qualification test/,
  );
});

test("gate selection preserves the production scheduler assignments", () => {
  assert.deepEqual(
    taskFiles(createRootTestTasksForGate(QUALIFICATION_GATES.PR)),
    rootTestFilesForGate(QUALIFICATION_GATES.PR).sort(),
  );
  assert.deepEqual(
    taskFiles(createRootTestTasksForGate(QUALIFICATION_GATES.RELEASE)),
    rootTestFilesForGate(QUALIFICATION_GATES.RELEASE).sort(),
  );
});

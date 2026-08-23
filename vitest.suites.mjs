export const mdlmPiTestFiles = [
  "packages/mdlm-pi/test/cli-process.test.ts",
  "packages/mdlm-pi/test/git-publisher.test.ts",
  "packages/mdlm-pi/test/live-integration.test.ts",
  "packages/mdlm-pi/test/mdlm-client.test.ts",
  "packages/mdlm-pi/test/pi-assignment-runner.test.ts",
  "packages/mdlm-pi/test/run-controller.test.ts",
  "packages/mdlm-pi/test/run-journal.test.ts",
  "packages/mdlm-pi/test/run-lock.test.ts",
];

// Durations are the latest selected successful focused observations. They
// include focused Vitest startup and remain estimates, not p95s.
export const rootTestManifest = [
  { file: "test/load-process-package.test.ts", runtimeClass: "process-repository-heavy", weight: 2, measuredDurationMs: 66_137 },
  { file: "test/mdlm-baseline-inspection.test.ts", runtimeClass: "process-repository-heavy", weight: 2, measuredDurationMs: 62_087 },
  { file: "test/mdlm-assignment.test.ts", runtimeClass: "process-repository-heavy", weight: 2, measuredDurationMs: 122_363 },
  { file: "test/proportional-distinct-context-phase-2-public.test.ts", runtimeClass: "process-repository-heavy", weight: 2, measuredDurationMs: 116_198 },

  { file: "test/dependency-changes.test.ts", runtimeClass: "canonical-fixture-filler", weight: 1, measuredDurationMs: 9_352 },
  { file: "test/evaluate-phase.test.ts", runtimeClass: "repository-public-sensitive", weight: 2, measuredDurationMs: 10_925 },
  { file: "test/evaluate-scoped-obligation.test.ts", runtimeClass: "repository-public-sensitive", weight: 2, measuredDurationMs: 7_039 },
  { file: "test/initial-product-intent-resolution.test.ts", runtimeClass: "repository-public-sensitive", weight: 2, measuredDurationMs: 22_675 },
  { file: "test/initial-product-intent-route.test.ts", runtimeClass: "repository-public-sensitive", weight: 2, measuredDurationMs: 45_706 },
  { file: "test/load-scenario-participation.test.ts", runtimeClass: "repository-public-sensitive", weight: 2, measuredDurationMs: 46_262 },
  { file: "test/mdlm-assignment-state.test.ts", runtimeClass: "repository-public-sensitive", weight: 2, measuredDurationMs: 40_610 },
  { file: "test/mdlm-clean-onboarding-transaction.test.ts", runtimeClass: "repository-public-sensitive", weight: 2, measuredDurationMs: 31_513 },
  { file: "test/mdlm-clean-pilot-contract.test.ts", runtimeClass: "repository-public-sensitive", weight: 2, measuredDurationMs: 28_026 },
  { file: "test/mdlm-command-application.test.ts", runtimeClass: "repository-public-sensitive", weight: 2, measuredDurationMs: 32_378 },
  { file: "test/mdlm-init.test.ts", runtimeClass: "repository-public-sensitive", weight: 2, measuredDurationMs: 33_961 },
  { file: "test/mdlm-lifecycle.test.ts", runtimeClass: "repository-public-sensitive", weight: 2, measuredDurationMs: 30_161 },
  { file: "test/mdlm-pilot-assessment.test.ts", runtimeClass: "repository-public-sensitive", weight: 2, measuredDurationMs: 8_972 },
  { file: "test/mdlm-process-expression.test.ts", runtimeClass: "repository-public-sensitive", weight: 2, measuredDurationMs: 29_024 },
  { file: "test/mdlm-process-migration.test.ts", runtimeClass: "repository-public-sensitive", weight: 2, measuredDurationMs: 47_070 },
  { file: "test/mdlm-repository-inspection.test.ts", runtimeClass: "repository-public-sensitive", weight: 2, measuredDurationMs: 29_994 },
  { file: "test/mdlm-review-assignment.test.ts", runtimeClass: "repository-public-sensitive", weight: 2, measuredDurationMs: 43_815 },
  { file: "test/mdlm-schema.test.ts", runtimeClass: "repository-public-sensitive", weight: 2, measuredDurationMs: 25_620 },
  { file: "test/operator-outcome.test.ts", runtimeClass: "repository-public-sensitive", weight: 2, measuredDurationMs: 34_682 },
  { file: "test/phase-0-corrected-gate-route.test.ts", runtimeClass: "repository-public-sensitive", weight: 2, measuredDurationMs: 56_461 },
  { file: "test/phase-0-hardening-routes.test.ts", runtimeClass: "canonical-fixture-filler", weight: 1, measuredDurationMs: 8_157 },
  { file: "test/phase-0-intent-candidate-currentness-route.test.ts", runtimeClass: "repository-public-sensitive", weight: 2, measuredDurationMs: 53_520 },
  { file: "test/phase-1-hardening-routes.test.ts", runtimeClass: "repository-public-sensitive", weight: 2, measuredDurationMs: 70_267 },
  { file: "test/phase-2-hardening-routes.test.ts", runtimeClass: "repository-public-sensitive", weight: 2, measuredDurationMs: 43_242 },
  { file: "test/proportional-phase-2-public.test.ts", runtimeClass: "canonical-fixture-filler", weight: 1, measuredDurationMs: 2_378 },
  { file: "test/selected-package-cache.test.ts", runtimeClass: "repository-public-sensitive", weight: 2, measuredDurationMs: 19_666 },

  { file: "test/change-and-pilot-hardening-routes.test.ts", runtimeClass: "cheap-in-process", weight: 1, measuredDurationMs: 15_111 },
  { file: "test/evaluate-bootstrap-participation.test.ts", runtimeClass: "cheap-in-process", weight: 1, measuredDurationMs: 4_054 },
  { file: "test/evaluate-lifecycle.test.ts", runtimeClass: "cheap-in-process", weight: 1, measuredDurationMs: 2_185 },
  { file: "test/evaluate-obligation-history.test.ts", runtimeClass: "cheap-in-process", weight: 1, measuredDurationMs: 3_316 },
  { file: "test/evaluate-review-flow.test.ts", runtimeClass: "cheap-in-process", weight: 1, measuredDurationMs: 2_501 },
  { file: "test/evaluate-shared-system-change.test.ts", runtimeClass: "cheap-in-process", weight: 1, measuredDurationMs: 3_154 },
  { file: "test/evaluate-system-decomposition.test.ts", runtimeClass: "cheap-in-process", weight: 1, measuredDurationMs: 2_761 },
  { file: "test/initial-product-intent-selectors.test.ts", runtimeClass: "cheap-in-process", weight: 1, measuredDurationMs: 4_686 },
  { file: "test/kernel-capability.test.ts", runtimeClass: "cheap-in-process", weight: 1, measuredDurationMs: 25_272 },
  { file: "test/phase-1-route-contracts.test.ts", runtimeClass: "cheap-in-process", weight: 1, measuredDurationMs: 1_992 },
  { file: "test/phase-hardening-domain-contracts.test.ts", runtimeClass: "cheap-in-process", weight: 1, measuredDurationMs: 3_952 },
  { file: "test/phase-hardening-matrix.test.ts", runtimeClass: "cheap-in-process", weight: 1, measuredDurationMs: 4_732 },
  { file: "test/pi-operator-instructions.test.ts", runtimeClass: "cheap-in-process", weight: 1, measuredDurationMs: 978 },
  { file: "test/resolve-type.test.ts", runtimeClass: "cheap-in-process", weight: 1, measuredDurationMs: 6_242 },
  { file: "test/scenario-policy-assets.test.ts", runtimeClass: "cheap-in-process", weight: 1, measuredDurationMs: 3_624 },
  { file: "test/selector-memoization.test.ts", runtimeClass: "cheap-in-process", weight: 1, measuredDurationMs: 2_427 },
  { file: "test/textual-expression.test.ts", runtimeClass: "cheap-in-process", weight: 1, measuredDurationMs: 2_441 },
];

export const rootVitestSuites = [
  "process-repository-heavy",
  "repository-public-sensitive",
  "canonical-fixture-filler",
  "cheap-in-process",
].map((id) => ({
  id,
  weight: rootTestManifest.find((entry) => entry.runtimeClass === id)?.weight,
  files: rootTestManifest
    .filter((entry) => entry.runtimeClass === id)
    .map((entry) => entry.file),
}));

// Compatibility export for Vitest configuration and tooling that need the
// complete root-suite membership rather than its resource schedule.
export const testFiles = rootTestManifest.map((entry) => entry.file);

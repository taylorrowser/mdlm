import { readFileSync } from "node:fs";
import path from "node:path";
import * as ts from "typescript";
import { rootTestManifest } from "../vitest.suites.mjs";

export const ROOT_TEST_OBSERVATION_KINDS = Object.freeze({
  CANONICAL_IN_PROCESS: "canonical-in-process",
  PROCESS_REPOSITORY: "process-repository",
});

// Review Assignment is the slowest exact max-2 test: 2 × 54,154 ms = 108,308 ms.
// Round strictly upward to the next 10,000 ms boundary.
export const PROCESS_REPOSITORY_TEST_TIMEOUT_MS = 110_000;

// Phase 0's contended 15,650 ms whole-file work is the conservative setup proxy:
// 2 × 15,650 ms = 31,300 ms, rounded strictly upward to 40,000 ms.
export const PROCESS_REPOSITORY_HOOK_TIMEOUT_MS = 40_000;

export const CONTENDED_IN_PROCESS_SETUP_LIMITS = Object.freeze({
  // Twice the 12,520 ms contended file observation, strictly rounded upward.
  "test/evaluate-phase.test.ts": 30_000,
  // Twice the measured 4,505 ms hook, strictly rounded upward.
  "test/load-scenario-participation.test.ts": 20_000,
  // Twice the 15,650 ms contended whole-file setup proxy, strictly rounded upward.
  "test/phase-0-hardening-routes.test.ts": 40_000,
});

const P = ROOT_TEST_OBSERVATION_KINDS.PROCESS_REPOSITORY;
const C = ROOT_TEST_OBSERVATION_KINDS.CANONICAL_IN_PROCESS;

const classification = Object.freeze({
  "test/load-process-package.test.ts": [C, "temporary Process Package copies and in-process graph/schema compilation"],
  "test/mdlm-baseline-inspection.test.ts": [P, "repository, Git, compiled child process, watcher, and publication lock"],
  "test/mdlm-assignment.test.ts": [P, "repository, compiled CLI, Git, lease lock, and publication lock"],
  "test/proportional-distinct-context-phase-2-public.test.ts": [P, "captured repository, Git, compiled CLI, and public assignment route"],
  "test/mdlm-clean-pilot-contract.test.ts": [P, "repository, Git, compiled CLI, and public command application"],
  "test/mdlm-lifecycle.test.ts": [P, "mixed in-process projections and repository/public command application"],
  "test/mdlm-process-migration.test.ts": [P, "compiled CLI, Git-backed repository, and Process Package migration"],
  "test/mdlm-review-assignment.test.ts": [P, "repository fork, Git, compiled CLI, and public command application"],
  "test/evaluate-phase.test.ts": [C, "in-process evaluation and temporary Process Package loading"],
  "test/evaluate-scoped-obligation.test.ts": [C, "in-process evaluation and temporary Process Package loading"],
  "test/initial-product-intent-resolution.test.ts": [P, "repository, Git, public command application, and assignment runner"],
  "test/initial-product-intent-route.test.ts": [P, "repository, Git, and repeated public assignment submission"],
  "test/load-scenario-participation.test.ts": [C, "temporary Process Package rewrite and in-process compilation/evaluation"],
  "test/mdlm-assignment-state.test.ts": [P, "repository, Git, and public command application"],
  "test/mdlm-clean-onboarding-transaction.test.ts": [P, "compiled CLI, repository, and Git"],
  "test/mdlm-command-application.test.ts": [P, "repository, public command application, and compiled CLI helper"],
  "test/mdlm-init.test.ts": [P, "compiled CLI, Git, FIFO, and package/distribution copies"],
  "test/mdlm-pilot-assessment.test.ts": [P, "compiled CLI and temporary repository"],
  "test/mdlm-process-expression.test.ts": [P, "repository and public command application"],
  "test/mdlm-repository-inspection.test.ts": [P, "repository, Git, public readers, and lazy repository fixture"],
  "test/mdlm-schema.test.ts": [P, "selected-package repository and public command application"],
  "test/operator-outcome.test.ts": [P, "mixed in-process classification and repository/public/compiled submission"],
  "test/phase-0-corrected-gate-route.test.ts": [P, "repository checkpoints and public assignment route"],
  "test/phase-0-intent-candidate-currentness-route.test.ts": [P, "repository, Git, and public assignment submission"],
  "test/phase-1-hardening-routes.test.ts": [P, "mixed canonical evaluation, repository/public application, Git, and process groups"],
  "test/phase-2-hardening-routes.test.ts": [P, "mixed synthetic evaluation and repository/public route"],
  "test/selected-package-cache.test.ts": [P, "initialized repositories and selected-package filesystem state"],
  "test/dependency-changes.test.ts": [C, "temporary Process Package copies and in-process dependency evaluation"],
  "test/phase-0-hardening-routes.test.ts": [C, "canonical in-process evaluation and dry-run resolvers"],
  "test/proportional-phase-2-public.test.ts": [C, "canonical in-process grouped-readiness evaluation"],
  "test/change-and-pilot-hardening-routes.test.ts": [C, "fixture/canonical in-process evaluation"],
  "test/evaluate-bootstrap-participation.test.ts": [C, "canonical in-process evaluation and dry-run resolvers"],
  "test/evaluate-lifecycle.test.ts": [C, "canonical in-process lifecycle evaluation"],
  "test/evaluate-obligation-history.test.ts": [C, "canonical in-process obligation-history evaluation"],
  "test/evaluate-review-flow.test.ts": [C, "canonical in-process review-flow evaluation"],
  "test/evaluate-shared-system-change.test.ts": [C, "canonical in-process shared-change evaluation"],
  "test/evaluate-system-decomposition.test.ts": [C, "canonical in-process system-decomposition evaluation"],
  "test/initial-product-intent-selectors.test.ts": [C, "canonical in-process selector evaluation"],
  "test/kernel-capability.test.ts": [C, "temporary Process Package loading and type resolution in process"],
  "test/phase-1-route-contracts.test.ts": [C, "canonical package and static route-contract inspection"],
  "test/phase-hardening-domain-contracts.test.ts": [C, "canonical/fixture in-process evaluation"],
  "test/phase-hardening-matrix.test.ts": [C, "static AST, manifest, matrix, and package inspection"],
  "test/pi-operator-instructions.test.ts": [C, "static instruction text inspection"],
  "test/resolve-type.test.ts": [C, "canonical and temporary Process Package type resolution"],
  "test/scenario-policy-assets.test.ts": [C, "temporary package and in-process dry-run evaluation"],
  "test/selector-memoization.test.ts": [C, "canonical in-process selector memoization"],
  "test/textual-expression.test.ts": [C, "in-process expression compilation and evaluation"],
});

export const rootTestObservationPolicy = Object.freeze(rootTestManifest.map((entry) => {
  const classified = classification[entry.file];
  if (!classified) throw new Error(`Missing observation policy for ${entry.file}`);
  const [observationKind, boundaryOwnership] = classified;
  const central = observationKind === P;
  const contendedSetup = CONTENDED_IN_PROCESS_SETUP_LIMITS[entry.file];
  return Object.freeze({
    file: entry.file,
    runtimeClass: entry.runtimeClass,
    observationKind,
    boundaryOwnership,
    effectiveDefaultTestTimeoutMs: central ? PROCESS_REPOSITORY_TEST_TIMEOUT_MS : 45_000,
    effectiveDefaultHookTimeoutMs: central
      ? PROCESS_REPOSITORY_HOOK_TIMEOUT_MS
      : contendedSetup ?? 10_000,
    disposition: central
      ? "replace inherited process/repository bounds with central max-2 limits; retain measured explicit non-stale bounds"
      : contendedSetup
        ? "retain canonical/in-process test semantics and apply the measured contended setup-hook limit"
        : "retain authoritative 45,000 ms test and 10,000 ms hook defaults for canonical/in-process work",
  });
}));

if (Object.keys(classification).length !== rootTestManifest.length) {
  throw new Error("Observation policy contains missing or non-manifest classifications");
}

const policyByFile = new Map(rootTestObservationPolicy.map((entry) => [entry.file, entry]));

export function rootTestObservationPolicyForPath(testPath, root = process.cwd()) {
  const normalizedPath = testPath.replaceAll("\\", "/");
  const normalizedRoot = root.replaceAll("\\", "/").replace(/\/$/, "");
  const relative = normalizedPath.startsWith(`${normalizedRoot}/`)
    ? normalizedPath.slice(normalizedRoot.length + 1)
    : normalizedPath;
  return policyByFile.get(relative);
}

const testCalls = new Set(["it", "test"]);
const hookCalls = new Set(["beforeAll", "beforeEach", "afterAll", "afterEach"]);
const staleLimits = new Set([10_000, 30_000, 60_000, 90_000]);

function calledBoundary(call) {
  if (ts.isIdentifier(call.expression)) return call.expression.text;
  if (ts.isCallExpression(call.expression)
    && ts.isPropertyAccessExpression(call.expression.expression)
    && ts.isIdentifier(call.expression.expression.expression)
    && ["each", "for"].includes(call.expression.expression.name.text)) {
    return call.expression.expression.expression.text;
  }
  return undefined;
}

function numericLimits(sourceFile) {
  const limits = new Map([
    ["PROCESS_REPOSITORY_HOOK_TIMEOUT_MS", PROCESS_REPOSITORY_HOOK_TIMEOUT_MS],
    ["PROCESS_REPOSITORY_TEST_TIMEOUT_MS", PROCESS_REPOSITORY_TEST_TIMEOUT_MS],
  ]);
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      if (ts.isNumericLiteral(node.initializer)) {
        limits.set(node.name.text, Number(node.initializer.text));
      } else if (ts.isIdentifier(node.initializer) && limits.has(node.initializer.text)) {
        limits.set(node.name.text, limits.get(node.initializer.text));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return limits;
}

function boundaryTitle(call, name) {
  if (hookCalls.has(name)) return name;
  const title = call.arguments[0];
  return title && (ts.isStringLiteral(title) || ts.isNoSubstitutionTemplateLiteral(title))
    ? title.text
    : name;
}

export function verifyRootTestObservationPolicy(root = process.cwd()) {
  const manifestFiles = rootTestManifest.map((entry) => entry.file).sort();
  const policyFiles = rootTestObservationPolicy.map((entry) => entry.file).sort();
  if (new Set(policyFiles).size !== 47
    || policyFiles.length !== 47
    || JSON.stringify(policyFiles) !== JSON.stringify(manifestFiles)) {
    throw new Error("Root observation policy must classify every manifest file exactly once");
  }

  const configSource = readFileSync(path.join(root, "vitest.fast.config.ts"), "utf8");
  const setupSource = readFileSync(
    path.join(root, "test/setup-root-observation-limits.ts"),
    "utf8",
  );
  if (!/setupFiles:\s*\["\.\/test\/setup-root-observation-limits\.ts"\]/.test(configSource)
    || !/testTimeout:\s*45_000/.test(configSource)) {
    throw new Error("Authoritative Vitest config does not install the root observation policy");
  }
  if (!/vi\.setConfig\(\{[\s\S]*?hookTimeout:[\s\S]*?testTimeout:/.test(setupSource)
    || !/CONTENDED_IN_PROCESS_SETUP_LIMITS\[policy\.file\]/.test(setupSource)) {
    throw new Error("Root observation setup does not apply the named policy limits");
  }

  const files = [];
  for (const policy of rootTestObservationPolicy) {
    const source = readFileSync(path.join(root, policy.file), "utf8");
    const sourceFile = ts.createSourceFile(
      policy.file,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const limits = numericLimits(sourceFile);
    const boundaries = [];
    const visit = (node) => {
      if (ts.isCallExpression(node)) {
        const name = calledBoundary(node);
        if (name && (testCalls.has(name) || hookCalls.has(name))) {
          const isTest = testCalls.has(name);
          const argumentIndex = isTest ? 2 : 1;
          const argument = node.arguments[argumentIndex];
          let explicit;
          if (argument && ts.isNumericLiteral(argument)) explicit = Number(argument.text);
          else if (argument && ts.isIdentifier(argument)) explicit = limits.get(argument.text);
          const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
          if (argument && explicit === undefined) {
            throw new Error(`${policy.file}:${line} has an unclassified explicit ${name} limit`);
          }
          const effectiveTimeoutMs = explicit ?? (isTest
            ? policy.effectiveDefaultTestTimeoutMs
            : policy.effectiveDefaultHookTimeoutMs);
          if (policy.observationKind === ROOT_TEST_OBSERVATION_KINDS.PROCESS_REPOSITORY
            && staleLimits.has(effectiveTimeoutMs)) {
            throw new Error(
              `${policy.file}:${line} retains stale effective ${effectiveTimeoutMs} ms ${name} limit`,
            );
          }
          boundaries.push(Object.freeze({
            line,
            kind: isTest ? "test" : "hook",
            call: name,
            title: boundaryTitle(node, name),
            declaredLimit: argument?.getText(sourceFile) ?? "policy default",
            effectiveTimeoutMs,
          }));
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    if (boundaries.length === 0) throw new Error(`${policy.file} has no test or hook boundaries`);
    files.push(Object.freeze({ ...policy, boundaries: Object.freeze(boundaries) }));
  }
  return Object.freeze(files);
}

export function renderRootTestObservationInventory(root = process.cwd()) {
  const files = verifyRootTestObservationPolicy(root);
  const lines = [
    "# Issue 203 complete observation-limit inventory",
    "",
    `Generated from ${rootTestManifest.length} exact production root manifest entries.`,
    "Authoritative Vitest defaults before per-file policy: tests 45,000 ms; hooks 10,000 ms.",
    `Process/repository policy: tests ${PROCESS_REPOSITORY_TEST_TIMEOUT_MS.toLocaleString("en-US")} ms; hooks ${PROCESS_REPOSITORY_HOOK_TIMEOUT_MS.toLocaleString("en-US")} ms.`,
    "",
    "## Exact 47-file classification",
    "",
    "| File | Runtime class | Boundary ownership | Effective default test/hook | Disposition |",
    "|---|---|---|---:|---|",
  ];
  for (const file of files) {
    lines.push(`| \`${file.file}\` | ${file.runtimeClass} | ${file.observationKind}: ${file.boundaryOwnership} | ${file.effectiveDefaultTestTimeoutMs.toLocaleString("en-US")} / ${file.effectiveDefaultHookTimeoutMs.toLocaleString("en-US")} ms | ${file.disposition} |`);
  }
  lines.push("", "## Every test and hook boundary", "");
  for (const file of files) {
    lines.push(`### \`${file.file}\``, "", "| Line | Kind | Title/call | Declared limit | Effective limit |", "|---:|---|---|---|---:|");
    for (const boundary of file.boundaries) {
      const title = boundary.title.replaceAll("|", "\\|").replaceAll("\n", " ");
      lines.push(`| ${boundary.line} | ${boundary.kind} | ${title} | \`${boundary.declaredLimit}\` | ${boundary.effectiveTimeoutMs.toLocaleString("en-US")} ms |`);
    }
    lines.push("");
  }
  lines.push(
    "## Measured formulas and retained dispositions",
    "",
    "- Review Assignment: 2 × 54,154 ms = 108,308 ms; strict 10,000 ms rounding gives 110,000 ms and clears the retained 91,141 ms failure.",
    "- Process/repository hooks: Phase 0's 15,650 ms contended whole-file setup proxy doubled to 31,300 ms; strict rounding gives 40,000 ms.",
    "- Participation hook: 2 × 4,505 ms strictly rounds to 20,000 ms.",
    "- Evaluate-phase hook: 2 × the 12,520 ms contended file observation strictly rounds to 30,000 ms.",
    "- Phase 0 hardening hook: the conservative 15,650 ms whole-file setup proxy doubled and strictly rounded gives 40,000 ms.",
    "- Corrected gate and migration retain their successful measured 70,000 ms named limits; 75,000/120,000/180,000/360,000/420,000/510,000 ms named limits remain where their existing evidence is stronger.",
    "- Canonical/in-process tests otherwise retain the authoritative 45,000 ms test and 10,000 ms hook semantics.",
    "- Internal synchronization, child-process safety, domain payload, and the exact 600,000 ms authoritative wrapper deadlines are not Vitest observation limits and were not changed.",
    "",
  );
  return lines.join("\n");
}

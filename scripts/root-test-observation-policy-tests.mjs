import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import * as ts from "typescript";

const PROCESS_REPOSITORY_TEST_FLOOR_MS = 180_000;
const PROCESS_REPOSITORY_HOOK_FLOOR_MS = 40_000;
const TEST_CALLS = new Set(["it", "test"]);
const HOOK_CALLS = new Set(["beforeAll", "beforeEach", "afterAll", "afterEach"]);

function calledName(call) {
  if (ts.isIdentifier(call.expression)) return call.expression.text;
  if (ts.isCallExpression(call.expression)) {
    const inner = call.expression;
    if (ts.isPropertyAccessExpression(inner.expression)
      && ts.isIdentifier(inner.expression.expression)
      && ["each", "for"].includes(inner.expression.name.text)) {
      return inner.expression.expression.text;
    }
  }
  return undefined;
}

function declaredNumericLimits(sourceFile) {
  const limits = new Map([
    ["PROCESS_REPOSITORY_HOOK_TIMEOUT_MS", 40_000],
    ["PROCESS_REPOSITORY_TEST_TIMEOUT_MS", PROCESS_REPOSITORY_TEST_FLOOR_MS],
  ]);
  const visit = (node) => {
    if (ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.initializer
      && ts.isNumericLiteral(node.initializer)) {
      limits.set(node.name.text, Number(node.initializer.text));
    } else if (ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.initializer
      && ts.isIdentifier(node.initializer)
      && limits.has(node.initializer.text)) {
      limits.set(node.name.text, limits.get(node.initializer.text));
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return limits;
}

function explicitLimit(call, name, limits) {
  const argumentIndex = TEST_CALLS.has(name) ? 2 : 1;
  const argument = call.arguments[argumentIndex];
  if (!argument) return undefined;
  if (ts.isNumericLiteral(argument)) return Number(argument.text);
  if (ts.isIdentifier(argument)) return limits.get(argument.text);
  return undefined;
}

test("every process/repository boundary obeys the central observation floors", async () => {
  const {
    PROCESS_REPOSITORY_HOOK_TIMEOUT_MS,
    PROCESS_REPOSITORY_TEST_TIMEOUT_MS,
    ROOT_TEST_OBSERVATION_KINDS,
    verifyRootTestObservationPolicy,
  } = await import("./root-test-observation-policy.mjs");

  const violations = verifyRootTestObservationPolicy()
    .filter((file) =>
      file.observationKind === ROOT_TEST_OBSERVATION_KINDS.PROCESS_REPOSITORY)
    .flatMap((file) => file.boundaries
      .filter((boundary) => boundary.effectiveTimeoutMs < (boundary.kind === "test"
        ? 180_000
        : 40_000))
      .map((boundary) =>
        `${file.file}:${boundary.line} ${boundary.kind} ${boundary.declaredLimit}=${boundary.effectiveTimeoutMs}`));

  assert.deepEqual(violations, []);
  assert.equal(PROCESS_REPOSITORY_HOOK_TIMEOUT_MS, 40_000);
  assert.equal(PROCESS_REPOSITORY_TEST_TIMEOUT_MS, 180_000);
});

test("all 47 root tests have complete executable observation-limit policy", async () => {
  const {
    PROCESS_REPOSITORY_HOOK_TIMEOUT_MS,
    PROCESS_REPOSITORY_TEST_TIMEOUT_MS,
    ROOT_TEST_OBSERVATION_KINDS,
    rootTestObservationPolicy,
    rootTestObservationPolicyForPath,
    verifyRootTestObservationPolicy,
  } = await import("./root-test-observation-policy.mjs");
  const { rootTestManifest } = await import("../vitest.suites.mjs");

  assert.equal(rootTestObservationPolicy.length, 47);
  assert.equal(new Set(rootTestObservationPolicy.map((entry) => entry.file)).size, 47);
  assert.deepEqual(
    rootTestObservationPolicy.map((entry) => entry.file).sort(),
    rootTestManifest.map((entry) => entry.file).sort(),
  );
  assert.deepEqual(ROOT_TEST_OBSERVATION_KINDS, {
    CANONICAL_IN_PROCESS: "canonical-in-process",
    PROCESS_REPOSITORY: "process-repository",
  });
  const verifiedFiles = verifyRootTestObservationPolicy();
  const verifiedByFile = new Map(verifiedFiles.map((file) => [file.file, file]));
  assert.equal(verifiedFiles.length, 47);
  assert.equal(PROCESS_REPOSITORY_HOOK_TIMEOUT_MS, 40_000);
  assert.equal(PROCESS_REPOSITORY_TEST_TIMEOUT_MS, 180_000);
  assert.deepEqual(
    Object.fromEntries(Object.entries(Object.groupBy(
      rootTestObservationPolicy,
      (entry) => entry.observationKind,
    )).map(([kind, entries]) => [kind, entries.length])),
    { "canonical-in-process": 24, "process-repository": 23 },
  );

  const setupSource = readFileSync(
    new URL("../test/setup-root-observation-limits.ts", import.meta.url),
    "utf8",
  );
  const configSource = readFileSync(new URL("../vitest.fast.config.ts", import.meta.url), "utf8");
  assert.match(configSource, /setupFiles:\s*\["\.\/test\/setup-root-observation-limits\.ts"\]/);
  assert.match(setupSource, /vi\.setConfig\(\{[\s\S]*?hookTimeout:[\s\S]*?testTimeout:/);

  let totalBoundaryCount = 0;
  for (const policy of rootTestObservationPolicy) {
    assert.match(policy.observationKind, /^(canonical-in-process|process-repository)$/);
    assert.equal(typeof policy.boundaryOwnership, "string");
    assert.notEqual(policy.boundaryOwnership.length, 0);
    assert.equal(typeof policy.disposition, "string");
    assert.notEqual(policy.disposition.length, 0);
    assert.equal(
      rootTestObservationPolicyForPath(`${process.cwd()}/${policy.file}`),
      policy,
    );

    const source = readFileSync(new URL(`../${policy.file}`, import.meta.url), "utf8");
    const sourceFile = ts.createSourceFile(
      policy.file,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const limits = declaredNumericLimits(sourceFile);
    const expectedBoundaries = [];
    const visit = (node) => {
      if (ts.isCallExpression(node)) {
        const name = calledName(node);
        if (name && (TEST_CALLS.has(name) || HOOK_CALLS.has(name))) {
          const argumentIndex = TEST_CALLS.has(name) ? 2 : 1;
          const hasExplicit = node.arguments[argumentIndex] !== undefined;
          const explicit = explicitLimit(node, name, limits);
          const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
          if (hasExplicit) {
            assert.notEqual(
              explicit,
              undefined,
              `${policy.file}:${line} has an unclassified explicit ${name} limit`,
            );
          }
          const effective = explicit ?? (TEST_CALLS.has(name)
            ? policy.effectiveDefaultTestTimeoutMs
            : policy.effectiveDefaultHookTimeoutMs);
          assert.equal(Number.isFinite(effective) && effective > 0, true);
          const kind = TEST_CALLS.has(name) ? "test" : "hook";
          if (policy.observationKind === ROOT_TEST_OBSERVATION_KINDS.PROCESS_REPOSITORY) {
            const floor = kind === "test"
              ? PROCESS_REPOSITORY_TEST_FLOOR_MS
              : PROCESS_REPOSITORY_HOOK_FLOOR_MS;
            assert.equal(
              effective >= floor,
              true,
              `${policy.file}:${line} has ${effective} ms effective ${kind} timeout below ${floor} ms`,
            );
          }
          expectedBoundaries.push({
            line,
            kind,
            call: name,
            declaredLimit: node.arguments[argumentIndex]?.getText(sourceFile) ?? "policy default",
            effectiveTimeoutMs: effective,
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    assert.notEqual(expectedBoundaries.length, 0, `${policy.file} has no test or hook boundaries`);
    totalBoundaryCount += expectedBoundaries.length;
    assert.deepEqual(
      verifiedByFile.get(policy.file)?.boundaries.map((boundary) => ({
        line: boundary.line,
        kind: boundary.kind,
        call: boundary.call,
        declaredLimit: boundary.declaredLimit,
        effectiveTimeoutMs: boundary.effectiveTimeoutMs,
      })),
      expectedBoundaries,
      `${policy.file} policy verification did not cover every parsed boundary exactly once`,
    );
  }
  assert.equal(totalBoundaryCount, 484);
});

test("the verifier rejects every former below-floor boundary and unresolved explicit values", async () => {
  const { rootTestManifest } = await import("../vitest.suites.mjs");
  const { verifyRootTestObservationPolicy } = await import("./root-test-observation-policy.mjs");
  const root = mkdtempSync(join(tmpdir(), "mdlm-observation-policy-"));
  const copy = (relativePath) => {
    const target = join(root, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(new URL(`../${relativePath}`, import.meta.url)));
  };

  try {
    copy("vitest.fast.config.ts");
    copy("test/setup-root-observation-limits.ts");
    for (const { file } of rootTestManifest) copy(file);
    assert.equal(verifyRootTestObservationPolicy(root).length, 47);

    const cases = [
      {
        label: "baseline hook 20,000",
        file: "test/mdlm-baseline-inspection.test.ts",
        from: "const CONTENDED_CHANGED_SETUP_HOOK_TIMEOUT_MS = PROCESS_REPOSITORY_HOOK_TIMEOUT_MS;",
        to: "const CONTENDED_CHANGED_SETUP_HOOK_TIMEOUT_MS = 20_000;",
        expected: ["effective hook timeout", "40000 ms process/repository floor"],
      },
      {
        label: "baseline test 45,000",
        file: "test/mdlm-baseline-inspection.test.ts",
        from: "const CONTENDED_TRACKED_CHANGES_TEST_TIMEOUT_MS = PROCESS_REPOSITORY_TEST_TIMEOUT_MS;",
        to: "const CONTENDED_TRACKED_CHANGES_TEST_TIMEOUT_MS = 45_000;",
        expected: ["effective test timeout", "180000 ms process/repository floor"],
      },
      {
        label: "assignment hook 20,000",
        file: "test/mdlm-assignment.test.ts",
        from: "const CONTENDED_TEST_SETUP_HOOK_TIMEOUT_MS = PROCESS_REPOSITORY_HOOK_TIMEOUT_MS;",
        to: "const CONTENDED_TEST_SETUP_HOOK_TIMEOUT_MS = 20_000;",
        expected: ["effective hook timeout", "40000 ms process/repository floor"],
      },
      {
        label: "assignment test 75,000",
        file: "test/mdlm-assignment.test.ts",
        from: "const CONTENDED_ASSIGNMENT_TEST_TIMEOUT_MS = PROCESS_REPOSITORY_TEST_TIMEOUT_MS;",
        to: "const CONTENDED_ASSIGNMENT_TEST_TIMEOUT_MS = 75_000;",
        expected: ["effective test timeout", "180000 ms process/repository floor"],
      },
      {
        label: "review test 110,000",
        file: "test/mdlm-review-assignment.test.ts",
        from: "const CONTENDED_REVIEW_ASSIGNMENT_TEST_TIMEOUT_MS = PROCESS_REPOSITORY_TEST_TIMEOUT_MS;",
        to: "const CONTENDED_REVIEW_ASSIGNMENT_TEST_TIMEOUT_MS = 110_000;",
        expected: ["effective test timeout", "180000 ms process/repository floor"],
      },
      {
        label: "operator test 45,000",
        file: "test/operator-outcome.test.ts",
        from: "  }, PROCESS_REPOSITORY_TEST_TIMEOUT_MS);\n\n  it(\"returns a declared Profile Boundary with omitted coverage and exact condition evidence\", () => {",
        to: "  }, 45_000);\n\n  it(\"returns a declared Profile Boundary with omitted coverage and exact condition evidence\", () => {",
        expected: ["effective test timeout", "180000 ms process/repository floor"],
      },
      {
        label: "initial product-intent route test 120,000",
        file: "test/initial-product-intent-route.test.ts",
        from: "  }, PROCESS_REPOSITORY_TEST_TIMEOUT_MS);\n});",
        to: "  }, 120_000);\n});",
        expected: ["effective test timeout", "180000 ms process/repository floor"],
      },
      {
        label: "assignment-state test 40,000",
        file: "test/mdlm-assignment-state.test.ts",
        from: "    expect(git(repository, \"status\", \"--porcelain\").stdout).toBe(\"\");\n  }, PROCESS_REPOSITORY_TEST_TIMEOUT_MS);",
        to: "    expect(git(repository, \"status\", \"--porcelain\").stdout).toBe(\"\");\n  }, 40_000);",
        expected: ["effective test timeout", "180000 ms process/repository floor"],
      },
      {
        label: "command hook 20,000",
        file: "test/mdlm-command-application.test.ts",
        from: "const CONTENDED_COMMAND_INITIALIZATION_HOOK_TIMEOUT_MS =\n  PROCESS_REPOSITORY_HOOK_TIMEOUT_MS;",
        to: "const CONTENDED_COMMAND_INITIALIZATION_HOOK_TIMEOUT_MS = 20_000;",
        expected: ["effective hook timeout", "40000 ms process/repository floor"],
      },
      {
        label: "migration test 70,000",
        file: "test/mdlm-process-migration.test.ts",
        from: "const CONTENDED_PROCESS_MIGRATION_TEST_TIMEOUT_MS =\n  PROCESS_REPOSITORY_TEST_TIMEOUT_MS;",
        to: "const CONTENDED_PROCESS_MIGRATION_TEST_TIMEOUT_MS = 70_000;",
        expected: ["effective test timeout", "180000 ms process/repository floor"],
      },
      {
        label: "corrected-gate test 70,000",
        file: "test/phase-0-corrected-gate-route.test.ts",
        from: "const CONTENDED_CORRECTED_GATE_ACCEPTANCE_TEST_TIMEOUT_MS =\n  PROCESS_REPOSITORY_TEST_TIMEOUT_MS;",
        to: "const CONTENDED_CORRECTED_GATE_ACCEPTANCE_TEST_TIMEOUT_MS = 70_000;",
        expected: ["effective test timeout", "180000 ms process/repository floor"],
      },
      {
        label: "phase-1 cleanup test 5,000",
        file: "test/phase-1-hardening-routes.test.ts",
        from: "  }, PROCESS_REPOSITORY_TEST_TIMEOUT_MS);\n});",
        to: "  }, 5_000);\n});",
        expected: ["effective test timeout", "180000 ms process/repository floor"],
      },
      {
        label: "arbitrary test value one millisecond below the floor",
        file: "test/phase-1-hardening-routes.test.ts",
        from: "  }, PROCESS_REPOSITORY_TEST_TIMEOUT_MS);\n\n  it(\"proves Phase 1 VAI correction, fresh Review, and refusal of prior RUN and RES reuse\", () => {",
        to: "  }, 179_999);\n\n  it(\"proves Phase 1 VAI correction, fresh Review, and refusal of prior RUN and RES reuse\", () => {",
        expected: ["effective test timeout", "180000 ms process/repository floor"],
      },
      {
        label: "unresolved explicit boundary identifier",
        file: "test/initial-product-intent-route.test.ts",
        from: "  }, PROCESS_REPOSITORY_TEST_TIMEOUT_MS);\n});",
        to: "  }, MISSING_PROCESS_REPOSITORY_TEST_TIMEOUT_MS);\n});",
        expected: ["unclassified explicit it limit"],
      },
    ];

    for (const mutation of cases) {
      const target = join(root, mutation.file);
      const original = readFileSync(target, "utf8");
      assert.equal(
        original.split(mutation.from).length - 1,
        1,
        `${mutation.label} fixture seam must occur exactly once`,
      );
      writeFileSync(target, original.replace(mutation.from, mutation.to));
      assert.throws(
        () => verifyRootTestObservationPolicy(root),
        (error) => {
          assert.match(error.message, new RegExp(mutation.file.replaceAll(".", "\\.")));
          for (const fragment of mutation.expected) assert.ok(error.message.includes(fragment));
          return true;
        },
        mutation.label,
      );
      writeFileSync(target, original);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("known contended in-process setup hooks use measured named limits", async () => {
  const { CONTENDED_IN_PROCESS_SETUP_LIMITS } = await import("./root-test-observation-policy.mjs");
  assert.deepEqual(CONTENDED_IN_PROCESS_SETUP_LIMITS, {
    "test/evaluate-phase.test.ts": 30_000,
    "test/load-scenario-participation.test.ts": 20_000,
    "test/phase-0-hardening-routes.test.ts": 40_000,
  });

  const setupSource = readFileSync(
    new URL("../test/setup-root-observation-limits.ts", import.meta.url),
    "utf8",
  );
  assert.match(setupSource, /CONTENDED_IN_PROCESS_SETUP_LIMITS\[policy\.file\]/);
  assert.match(setupSource, /vi\.setConfig\(\{ hookTimeout \}\)/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as ts from "typescript";

const FORBIDDEN_STALE_LIMITS_MS = new Set([10_000, 30_000, 60_000, 90_000]);
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
    ["PROCESS_REPOSITORY_TEST_TIMEOUT_MS", 110_000],
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
  assert.equal(verifyRootTestObservationPolicy().length, 47);
  assert.equal(PROCESS_REPOSITORY_HOOK_TIMEOUT_MS, 40_000);
  assert.equal(PROCESS_REPOSITORY_TEST_TIMEOUT_MS, 110_000);
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
    let boundaryCount = 0;
    const visit = (node) => {
      if (ts.isCallExpression(node)) {
        const name = calledName(node);
        if (name && (TEST_CALLS.has(name) || HOOK_CALLS.has(name))) {
          boundaryCount += 1;
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
          if (policy.observationKind === ROOT_TEST_OBSERVATION_KINDS.PROCESS_REPOSITORY
            && FORBIDDEN_STALE_LIMITS_MS.has(effective)) {
            assert.fail(`${policy.file}:${line} retains stale effective ${effective} ms ${name} limit`);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    assert.notEqual(boundaryCount, 0, `${policy.file} has no test or hook boundaries`);
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

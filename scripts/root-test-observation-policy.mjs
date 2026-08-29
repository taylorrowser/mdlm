import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import * as ts from "typescript";
import { rootTestManifest } from "../vitest.suites.mjs";

export const ROOT_TEST_OBSERVATION_KINDS = Object.freeze({
  CANONICAL_IN_PROCESS: "canonical-in-process",
  PROCESS_REPOSITORY: "process-repository",
});

// Exact authoritative gates censored the restored initial-intent route at both
// 180,000 ms (bca07ad) and 240,000 ms (1a2aaa9) under valid three-way contention.
// Add half of the latest failed lower bound and round to a finite 360,000 ms.
// Neither censored duration is treated as successful timing evidence.
export const PROCESS_REPOSITORY_TEST_TIMEOUT_MS = 360_000;

// Phase 0's contended 15,650 ms whole-file work is the conservative setup proxy:
// 2 × 15,650 ms = 31,300 ms, rounded strictly upward to 40,000 ms.
export const PROCESS_REPOSITORY_HOOK_TIMEOUT_MS = 40_000;

// The failed clean-onboarding helper observed a compiled child for exactly
// 10,000 ms. Six times that observation gives child startup and repository
// initialization room while remaining one sixth of the 360,000 ms enclosing
// process/repository test boundary.
export const PROCESS_REPOSITORY_CHILD_TIMEOUT_MS = 60_000;

export const CONTENDED_IN_PROCESS_SETUP_LIMITS = Object.freeze({
  // Twice the 12,520 ms contended file observation, strictly rounded upward.
  "test/evaluate-phase.test.ts": 30_000,
  // The 10,300 ms failed max-3 setup observation is status evidence only.
  // Apply the central 30,000 ms contended setup limit without treating the
  // failed file wall as a successful timing input.
  "test/evaluate-scoped-obligation.test.ts": 30_000,
  // Twice the measured 4,505 ms hook, strictly rounded upward.
  "test/load-scenario-participation.test.ts": 20_000,
});

const PROCESS_REPOSITORY_KIND = ROOT_TEST_OBSERVATION_KINDS.PROCESS_REPOSITORY;
const CANONICAL_IN_PROCESS_KIND = ROOT_TEST_OBSERVATION_KINDS.CANONICAL_IN_PROCESS;

// This is an exhaustive semantic observation-policy dimension, separate from
// the runtime classification in vitest.suites.mjs. Verification below rejects
// drift in either list.
const classification = Object.freeze({
  "test/load-process-package.test.ts": [CANONICAL_IN_PROCESS_KIND, "temporary Process Package copies and in-process graph/schema compilation"],
  "test/mdlm-assignment.test.ts": [PROCESS_REPOSITORY_KIND, "repository, compiled CLI, Git, lease lock, and publication lock"],
  "test/proportional-distinct-context-phase-2-public.test.ts": [PROCESS_REPOSITORY_KIND, "captured repository, Git, compiled CLI, and public assignment route"],
  "test/mdlm-lifecycle.test.ts": [PROCESS_REPOSITORY_KIND, "mixed in-process projections and repository/public command application"],
  "test/mdlm-process-migration.test.ts": [PROCESS_REPOSITORY_KIND, "compiled CLI, Git-backed repository, and Process Package migration"],
  "test/evaluate-phase.test.ts": [CANONICAL_IN_PROCESS_KIND, "in-process evaluation and temporary Process Package loading"],
  "test/evaluate-scoped-obligation.test.ts": [CANONICAL_IN_PROCESS_KIND, "in-process evaluation and temporary Process Package loading"],
  "test/load-scenario-participation.test.ts": [CANONICAL_IN_PROCESS_KIND, "temporary Process Package rewrite and in-process compilation/evaluation"],
  "test/mdlm-assignment-state.test.ts": [PROCESS_REPOSITORY_KIND, "repository, Git, and public command application"],
  "test/mdlm-clean-onboarding-transaction.test.ts": [PROCESS_REPOSITORY_KIND, "compiled CLI, repository, and Git"],
  "test/mdlm-command-application.test.ts": [PROCESS_REPOSITORY_KIND, "repository, public command application, and compiled CLI helper"],
  "test/mdlm-init.test.ts": [PROCESS_REPOSITORY_KIND, "compiled CLI, Git, FIFO, and package/distribution copies"],
  "test/mdlm-pilot-assessment.test.ts": [PROCESS_REPOSITORY_KIND, "compiled CLI and temporary repository"],
  "test/mdlm-process-expression.test.ts": [PROCESS_REPOSITORY_KIND, "repository and public command application"],
  "test/mdlm-repository-inspection.test.ts": [PROCESS_REPOSITORY_KIND, "repository, Git, public readers, and lazy repository fixture"],
  "test/mdlm-schema.test.ts": [PROCESS_REPOSITORY_KIND, "selected-package repository and public command application"],
  "test/operator-outcome.test.ts": [PROCESS_REPOSITORY_KIND, "mixed in-process classification and repository/public/compiled submission"],
  "test/atomic-review-submit.test.ts": [PROCESS_REPOSITORY_KIND, "temporary Process Package, repository, lease, and atomic public submission"],
  "test/selected-package-cache.test.ts": [PROCESS_REPOSITORY_KIND, "initialized repositories and selected-package filesystem state"],
  "test/dependency-changes.test.ts": [CANONICAL_IN_PROCESS_KIND, "temporary Process Package copies and in-process dependency evaluation"],
  "test/proportional-phase-2-public.test.ts": [CANONICAL_IN_PROCESS_KIND, "canonical in-process grouped-readiness evaluation"],
  "test/evaluate-bootstrap-participation.test.ts": [CANONICAL_IN_PROCESS_KIND, "canonical in-process evaluation and dry-run resolvers"],
  "test/evaluate-lifecycle.test.ts": [CANONICAL_IN_PROCESS_KIND, "canonical in-process lifecycle evaluation"],
  "test/evaluate-obligation-history.test.ts": [CANONICAL_IN_PROCESS_KIND, "canonical in-process obligation-history evaluation"],
  "test/evaluate-review-flow.test.ts": [CANONICAL_IN_PROCESS_KIND, "canonical in-process review-flow evaluation"],
  "test/phase-1-review-routing.test.ts": [CANONICAL_IN_PROCESS_KIND, "canonical in-process Phase 1 obligation and resolver evaluation"],
  "test/evaluate-shared-system-change.test.ts": [CANONICAL_IN_PROCESS_KIND, "canonical in-process shared-change evaluation"],
  "test/evaluate-system-decomposition.test.ts": [CANONICAL_IN_PROCESS_KIND, "canonical in-process system-decomposition evaluation"],
  "test/initial-product-intent-selectors.test.ts": [CANONICAL_IN_PROCESS_KIND, "canonical in-process selector evaluation"],
  "test/kernel-capability.test.ts": [CANONICAL_IN_PROCESS_KIND, "temporary Process Package loading and type resolution in process"],
  "test/cutover-corpus.test.ts": [CANONICAL_IN_PROCESS_KIND, "exact cutover bytes and public contract fixtures"],
  "test/pi-operator-instructions.test.ts": [CANONICAL_IN_PROCESS_KIND, "static instruction text inspection"],
  "test/resolve-type.test.ts": [CANONICAL_IN_PROCESS_KIND, "canonical and temporary Process Package type resolution"],
  "test/selector-memoization.test.ts": [CANONICAL_IN_PROCESS_KIND, "canonical in-process selector memoization"],
  "test/textual-expression.test.ts": [CANONICAL_IN_PROCESS_KIND, "in-process expression compilation and evaluation"],
});

export const rootTestObservationPolicy = Object.freeze(rootTestManifest.map((entry) => {
  const classified = classification[entry.file];
  if (!classified) throw new Error(`Missing observation policy for ${entry.file}`);
  const [observationKind, boundaryOwnership] = classified;
  const central = observationKind === PROCESS_REPOSITORY_KIND;
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
      ? "apply central process/repository floors; retain stronger explicit bounds"
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
  if (new Set(policyFiles).size !== 46
    || policyFiles.length !== 46
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
          const minimumTimeoutMs = isTest
            ? PROCESS_REPOSITORY_TEST_TIMEOUT_MS
            : PROCESS_REPOSITORY_HOOK_TIMEOUT_MS;
          if (policy.observationKind === ROOT_TEST_OBSERVATION_KINDS.PROCESS_REPOSITORY
            && effectiveTimeoutMs < minimumTimeoutMs) {
            throw new Error(
              `${policy.file}:${line} has ${effectiveTimeoutMs} ms effective ${isTest ? "test" : "hook"} timeout below the ${minimumTimeoutMs} ms process/repository floor`,
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

const childProcessApis = new Set([
  "exec", "execFile", "execFileSync", "execSync", "fork", "spawn", "spawnSync",
]);
const childProcessOptionsArgument = Object.freeze({
  exec: 1,
  execFile: 2,
  execFileSync: 2,
  execSync: 1,
  fork: 2,
  spawn: 2,
  spawnSync: 2,
});

const nonChildTimeoutDispositions = Object.freeze([
  {
    file: "test/mdlm-assignment.test.ts",
    search: "function waitForPath(\n  target: string,\n  message: string,\n  timeoutMs = 10_000,",
    kind: "synchronization-barrier-default",
    effectiveTimeout: "10,000 ms",
    disposition: "filesystem synchronization barrier; not a child-process option",
  },
  {
    file: "test/mdlm-assignment.test.ts",
    search: "function waitForDirectoryEntry(\n  directory: string,\n  predicate: (entry: string) => boolean,\n  message: string,\n  timeoutMs = 10_000,",
    kind: "synchronization-barrier-default",
    effectiveTimeout: "10,000 ms",
    disposition: "filesystem synchronization barrier; not a child-process option",
  },
]);

function sourceLine(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function resolveRelativeTestImport(importer, specifier, root) {
  if (!specifier.startsWith(".")) return undefined;
  const absoluteBase = path.resolve(root, path.dirname(importer), specifier);
  const candidates = [absoluteBase];
  if (/\.js$/.test(absoluteBase)) candidates.unshift(absoluteBase.replace(/\.js$/, ".ts"));
  if (/\.mjs$/.test(absoluteBase)) candidates.unshift(absoluteBase.replace(/\.mjs$/, ".mts"));
  if (!path.extname(absoluteBase)) {
    candidates.push(`${absoluteBase}.ts`, `${absoluteBase}.mts`, path.join(absoluteBase, "index.ts"));
  }
  for (const candidate of candidates) {
    const relative = path.relative(root, candidate).split(path.sep).join("/");
    if (relative.startsWith("test/") && existsSync(candidate)) return relative;
  }
  return undefined;
}

function numericExpressionValue(expression, finiteLimits, parameterDefaults) {
  const value = ts.isParenthesizedExpression(expression) ? expression.expression : expression;
  if (ts.isNumericLiteral(value)) return Number(value.text);
  if (ts.isIdentifier(value)) return finiteLimits.get(value.text) ?? parameterDefaults.get(value.text);
  return undefined;
}

function enclosingParameterDefaults(node, finiteLimits) {
  const defaults = new Map();
  let current = node.parent;
  while (current) {
    if (ts.isFunctionLike(current)) {
      for (const parameter of current.parameters) {
        if (ts.isIdentifier(parameter.name) && parameter.initializer) {
          const value = numericExpressionValue(parameter.initializer, finiteLimits, defaults);
          if (value !== undefined) defaults.set(parameter.name.text, value);
        }
      }
      break;
    }
    current = current.parent;
  }
  return defaults;
}

function timeoutFromOptions(expression, sourceFile, finiteLimits, parameterDefaults) {
  const value = ts.isParenthesizedExpression(expression) ? expression.expression : expression;
  if (ts.isConditionalExpression(value)) {
    const left = timeoutFromOptions(value.whenTrue, sourceFile, finiteLimits, parameterDefaults);
    const right = timeoutFromOptions(value.whenFalse, sourceFile, finiteLimits, parameterDefaults);
    if (left === undefined && right === undefined) return undefined;
    if (left?.effectiveTimeoutMs === right?.effectiveTimeoutMs) return left;
    throw new Error(`${sourceFile.fileName}:${sourceLine(sourceFile, value)} has branch-dependent child timeout options`);
  }
  if (!ts.isObjectLiteralExpression(value)) {
    throw new Error(`${sourceFile.fileName}:${sourceLine(sourceFile, value)} has unresolved child-process options`);
  }
  let timeout;
  for (const property of value.properties) {
    if (ts.isSpreadAssignment(property)) {
      const spreadTimeout = timeoutFromOptions(
        property.expression,
        sourceFile,
        finiteLimits,
        parameterDefaults,
      );
      if (spreadTimeout !== undefined) timeout = spreadTimeout;
      continue;
    }
    if (!ts.isPropertyAssignment(property) || property.name.getText(sourceFile) !== "timeout") continue;
    const effectiveTimeoutMs = numericExpressionValue(
      property.initializer,
      finiteLimits,
      parameterDefaults,
    );
    if (effectiveTimeoutMs === undefined) {
      throw new Error(
        `${sourceFile.fileName}:${sourceLine(sourceFile, property)} has unresolved child timeout '${property.initializer.getText(sourceFile)}'`,
      );
    }
    timeout = {
      declaredTimeout: property.initializer.getText(sourceFile),
      effectiveTimeoutMs,
    };
  }
  return timeout;
}

function analyzeChildProcessSource(file, root, sourceCache) {
  const cached = sourceCache.get(file);
  if (cached) return cached;
  const source = readFileSync(path.join(root, file), "utf8");
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const importedApis = new Map();
  const imports = [];
  const finiteLimits = new Map([
    ["PROCESS_REPOSITORY_CHILD_TIMEOUT_MS", PROCESS_REPOSITORY_CHILD_TIMEOUT_MS],
  ]);

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const specifier = statement.moduleSpecifier.text;
    const dependency = resolveRelativeTestImport(file, specifier, root);
    if (dependency) imports.push(dependency);
    if (
      specifier === "node:child_process" &&
      statement.importClause?.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      for (const element of statement.importClause.namedBindings.elements) {
        const api = (element.propertyName ?? element.name).text;
        if (childProcessApis.has(api)) importedApis.set(element.name.text, api);
      }
    }
  }

  const visitDeclarations = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const numeric = numericExpressionValue(node.initializer, finiteLimits, new Map());
      if (numeric !== undefined) finiteLimits.set(node.name.text, numeric);
      if (
        ts.isCallExpression(node.initializer) &&
        ts.isIdentifier(node.initializer.expression) &&
        node.initializer.expression.text === "promisify" &&
        node.initializer.arguments.length === 1 &&
        ts.isIdentifier(node.initializer.arguments[0])
      ) {
        const api = importedApis.get(node.initializer.arguments[0].text);
        if (api) importedApis.set(node.name.text, api);
      }
    }
    ts.forEachChild(node, visitDeclarations);
  };
  visitDeclarations(sourceFile);

  const launches = [];
  const visitLaunches = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && importedApis.has(node.expression.text)) {
      const api = importedApis.get(node.expression.text);
      const options = node.arguments[childProcessOptionsArgument[api]];
      const timeout = options
        ? timeoutFromOptions(options, sourceFile, finiteLimits, enclosingParameterDefaults(node, finiteLimits))
        : undefined;
      const line = sourceLine(sourceFile, node);
      const effectiveTimeoutMs = timeout?.effectiveTimeoutMs ?? null;
      if (effectiveTimeoutMs !== null && (!Number.isFinite(effectiveTimeoutMs) || effectiveTimeoutMs <= 0)) {
        throw new Error(`${file}:${line} has a non-positive child timeout`);
      }
      if (effectiveTimeoutMs !== null && effectiveTimeoutMs < PROCESS_REPOSITORY_CHILD_TIMEOUT_MS) {
        throw new Error(
          `${file}:${line} child timeout ${effectiveTimeoutMs} ms is below the central ${PROCESS_REPOSITORY_CHILD_TIMEOUT_MS} ms floor`,
        );
      }
      launches.push(Object.freeze({
        key: `${file}:${line}:${api}`,
        file,
        line,
        api,
        declaredTimeout: timeout?.declaredTimeout ?? "none (unbounded)",
        effectiveTimeoutMs,
        disposition: effectiveTimeoutMs === null
          ? "unbounded child launch; enclosing Vitest boundary owns observation"
          : timeout.declaredTimeout === "PROCESS_REPOSITORY_CHILD_TIMEOUT_MS"
          ? "central process/repository child observation deadline"
          : "finite child observation deadline at or above central floor",
      }));
    }
    ts.forEachChild(node, visitLaunches);
  };
  visitLaunches(sourceFile);

  const result = Object.freeze({ imports: Object.freeze(imports), launches: Object.freeze(launches) });
  sourceCache.set(file, result);
  return result;
}

function locateNonChildTimeouts(root) {
  return Object.freeze(nonChildTimeoutDispositions.map((entry) => {
    const source = readFileSync(path.join(root, entry.file), "utf8");
    const position = source.indexOf(entry.search);
    if (position < 0 || source.indexOf(entry.search, position + 1) >= 0) {
      throw new Error(`${entry.file} must contain exactly one classified ${entry.kind}`);
    }
    return Object.freeze({
      file: entry.file,
      line: source.slice(0, position).split("\n").length,
      kind: entry.kind,
      effectiveTimeout: entry.effectiveTimeout,
      disposition: entry.disposition,
    });
  }));
}

export function verifyRootTestChildProcessPolicy(root = process.cwd()) {
  const sourceCache = new Map();
  const launchReachability = new Map();
  const manifests = rootTestManifest.map((entry) => {
    const visited = new Set();
    const visit = (file) => {
      if (visited.has(file)) return;
      visited.add(file);
      const analysis = analyzeChildProcessSource(file, root, sourceCache);
      for (const launch of analysis.launches) {
        const roots = launchReachability.get(launch.key) ?? new Set();
        roots.add(entry.file);
        launchReachability.set(launch.key, roots);
      }
      for (const dependency of analysis.imports) visit(dependency);
    };
    visit(entry.file);
    return Object.freeze({ file: entry.file, sourceFiles: Object.freeze([...visited].sort()) });
  });
  const launches = [...sourceCache.values()]
    .flatMap((entry) => entry.launches)
    .sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line)
    .map((launch) => Object.freeze({
      ...launch,
      reachableFrom: Object.freeze([...(launchReachability.get(launch.key) ?? [])].sort()),
    }));
  return Object.freeze({
    manifests: Object.freeze(manifests),
    launches: Object.freeze(launches),
    nonChildTimeouts: locateNonChildTimeouts(root),
  });
}

export function renderRootTestObservationInventory(root = process.cwd()) {
  const files = verifyRootTestObservationPolicy(root);
  const childProcesses = verifyRootTestChildProcessPolicy(root);
  const lines = [
    "# Issue 203 complete observation-limit inventory",
    "",
    `Generated from ${rootTestManifest.length} exact production root manifest entries.`,
    "Authoritative Vitest defaults before per-file policy: tests 45,000 ms; hooks 10,000 ms.",
    `Process/repository policy: tests ${PROCESS_REPOSITORY_TEST_TIMEOUT_MS.toLocaleString("en-US")} ms; hooks ${PROCESS_REPOSITORY_HOOK_TIMEOUT_MS.toLocaleString("en-US")} ms; bounded child observations ${PROCESS_REPOSITORY_CHILD_TIMEOUT_MS.toLocaleString("en-US")} ms.`,
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
    "## Test-owned child-process launch observations",
    "",
    "The AST walk starts at every exact root manifest entry and follows relative test-helper imports. `none (unbounded)` means Node has no child timeout option; the enclosing finite Vitest boundary remains the observation owner.",
    "",
    "| Source | API | Declared child timeout | Effective value | Disposition | Reachable root manifests |",
    "|---|---|---|---:|---|---|",
  );
  for (const launch of childProcesses.launches) {
    lines.push(
      `| \`${launch.file}:${launch.line}\` | ${launch.api} | \`${launch.declaredTimeout}\` | ${launch.effectiveTimeoutMs === null ? "unbounded" : `${launch.effectiveTimeoutMs.toLocaleString("en-US")} ms`} | ${launch.disposition} | ${launch.reachableFrom.map((file) => `\`${file}\``).join("<br>")} |`,
    );
  }
  lines.push(
    "",
    "## Classified non-child timeout semantics",
    "",
    "These timeout-like values are executable synchronization or domain-contract inputs, not Node child-process observation options.",
    "",
    "| Source | Kind | Effective value | Disposition |",
    "|---|---|---|---|",
  );
  for (const timeout of childProcesses.nonChildTimeouts) {
    lines.push(
      `| \`${timeout.file}:${timeout.line}\` | ${timeout.kind} | ${timeout.effectiveTimeout} | ${timeout.disposition} |`,
    );
  }
  lines.push(
    "",
    "## Measured formulas and retained dispositions",
    "",
    "- Process/repository tests: exact authoritative gates censored the restored initial-intent route at 180,000 ms and 240,000 ms under valid three-way contention; adding half of the latest failed lower bound gives a finite 360,000 ms without using either censor as successful timing evidence.",
    "- Process/repository hooks: Phase 0's 15,650 ms contended whole-file setup proxy doubled to 31,300 ms; strict rounding gives 40,000 ms.",
    "- Process/repository bounded child observations: 6 × the exact failed 10,000 ms helper observation gives 60,000 ms, one sixth of the 360,000 ms enclosing test floor.",
    "- Participation hook: 2 × 4,505 ms strictly rounds to 20,000 ms.",
    "- Evaluate-phase hook: 2 × the 12,520 ms contended file observation strictly rounds to 30,000 ms.",
    "- Scoped-obligation hook: the failed 10,300 ms setup observation remains failure evidence; the central 30,000 ms contended setup limit clears it without treating that wall as a successful timing input.",
    "- Phase 1 cleanup probe: the authoritative four-process start proved 300 ms plus 100 ms grace could expire before descendant readiness. The test-owned contract now uses a synchronous parent partial marker, a 3,000 ms probe deadline, and bounded 1,000 ms cleanup grace; production deadlines are unchanged.",
    "- Phase 0 hardening hook: the conservative 15,650 ms whole-file setup proxy doubled and strictly rounded gives 40,000 ms.",
    "- Former process/repository 20,000 ms hooks and 5,000/40,000/45,000/70,000/75,000/120,000 ms tests now use the central floors; stronger 360,000 and 510,000 ms process/repository tests remain.",
    "- Canonical/in-process measured 20,000/30,000/40,000 ms hooks and the 420,000 ms proportional test remain unchanged.",
    "- Canonical/in-process tests otherwise retain the authoritative 45,000 ms test and 10,000 ms hook semantics.",
    "- Internal synchronization, the test-owned timeout-cleanup proof, domain payload, and the exact 2,400,000 ms authoritative wrapper deadline are not child-process options or Vitest observation limits. Only the test-owned cleanup proof changed.",
    "",
  );
  return lines.join("\n");
}

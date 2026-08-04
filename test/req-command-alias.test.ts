import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse, stringify } from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { copiedProcessPackage } from "./helpers/process-package.js";
import { req } from "./helpers/req.js";

const bootstrapPackage = path.join(process.cwd(), ".lifecycle/process");

async function treeDigest(root: string): Promise<string> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else files.push(path.relative(root, absolute));
    }
  }
  await visit(root);
  const hash = createHash("sha256");
  for (const file of files.sort()) {
    hash.update(file).update("\0").update(await fs.readFile(path.join(root, file)));
  }
  return hash.digest("hex");
}

async function repositoryWithQuestion(): Promise<{
  root: string;
  question: { id: string; revisionId: string };
  obligation: string;
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-alias-"));
  const initialized = req(root, "init", "--process", bootstrapPackage, "--json");
  expect(initialized.status, initialized.stderr).toBe(0);
  const packageDigest = JSON.parse(initialized.stdout).package.digest;
  const created = req(
    root,
    "new",
    "QST",
    "--scenario",
    "resolve-question@1",
    "--set",
    "title=Alias question",
    "--set",
    "kind=empirical",
    "--set",
    "question=Does a package alias preserve the Scenario contract?",
    "--set",
    "state=open",
    "--set",
    "blocking_impact=Safe convenience remains unproven",
    "--json",
  );
  expect(created.status, created.stderr).toBe(0);
  const question = JSON.parse(created.stdout).created;
  const baseline = req(
    root,
    "baseline",
    "create",
    "--type",
    "BSL",
    "--scenario",
    "create-review-context@1",
    "--set",
    "title=Alias source baseline",
    "--set",
    "kind=review-context",
    "--set",
    "role=review-context",
    "--set",
    "scope=alias source",
    "--set",
    "group=DEFAULT",
    "--json",
  );
  expect(baseline.status, baseline.stderr).toBe(0);
  const baselineCreated = JSON.parse(baseline.stdout).created;
  const baselineId = baselineCreated.id;
  expect(req(root, "baseline", "add", baselineId, question.revisionId, "--json").status).toBe(0);
  expect(req(root, "baseline", "freeze", baselineId, "--json").status).toBe(0);
  return {
    root,
    question,
    obligation: `open-question-resolution@2:${question.revisionId}:mdlm-bootstrap@0.26.0#${packageDigest}`,
  };
}

function validResponse(question: { id: string; revisionId: string }) {
  return {
    outputs: [
      {
        name: "decision",
        invocation: 0,
        lifecycleDatum: {
          type: "DEC",
          payload: {
            title: "Resolve alias question",
            rationale: "Direct and aliased requests are equivalent.",
            kind: "decision",
            decision: "The alias preserves the Scenario contract.",
            alternatives: ["Use only the generic command"],
            effective_scope: "safe Package Command Alias tracer bullet",
          },
          links: [{ type: "resolves", target: question.revisionId }],
          body: "Alias-produced decision.\n",
        },
      },
      {
        name: "updated_question",
        invocation: 0,
        lifecycleDatum: {
          id: question.id,
          type: "QST",
          payload: {
            title: "Alias question",
            kind: "empirical",
            question: "Does a package alias preserve the Scenario contract?",
            state: "answered",
            blocking_impact: "Safe convenience remains unproven",
          },
          links: [],
          body: "Resolved through the safe alias.\n",
        },
      },
    ],
    completionEvidence: { summary: "The same bounded Scenario executed." },
  };
}

async function adapter(
  root: string,
  response: unknown,
  name: string,
): Promise<{ executable: string; capture: string }> {
  const executable = path.join(root, `${name}.mjs`);
  const capture = path.join(root, `${name}.request.json`);
  await fs.writeFile(
    executable,
    `#!/usr/bin/env node\nimport fs from "node:fs";\nconst input = fs.readFileSync(0, "utf8");\nfs.writeFileSync(${JSON.stringify(capture)}, input);\nprocess.stdout.write(${JSON.stringify(JSON.stringify(response))});\n`,
    { mode: 0o755 },
  );
  return { executable, capture };
}

describe("req Package Command Alias", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true })
    ));
  });

  it("binds typed arguments to the same validated Scenario request as direct invocation", async () => {
    const source = await repositoryWithQuestion();
    roots.push(source.root);
    const aliasRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-alias-copy-"));
    roots.push(aliasRoot);
    await fs.cp(source.root, aliasRoot, { recursive: true });
    const shown = req(aliasRoot, "process", "show", "--json");
    expect(shown.status, shown.stderr).toBe(0);
    expect(JSON.parse(shown.stdout).inspection.definitionCatalogs.aliases).toEqual([
      "question.resolve@1",
    ]);
    const directAdapter = await adapter(
      source.root,
      validResponse(source.question),
      "direct-adapter",
    );
    const aliasAdapter = await adapter(
      aliasRoot,
      validResponse(source.question),
      "alias-adapter",
    );

    const direct = req(
      source.root,
      "scenario",
      "execute",
      "resolve-question@1",
      "--obligation",
      source.obligation,
      "--adapter",
      directAdapter.executable,
      "--input",
      `question=${source.question.revisionId}`,
      "--json",
    );
    const aliased = req(
      aliasRoot,
      "question",
      "resolve",
      "--obligation",
      source.obligation,
      "--adapter",
      aliasAdapter.executable,
      "--question",
      source.question.revisionId,
      "--json",
    );

    expect(direct.status, direct.stderr).toBe(0);
    expect(aliased.status, aliased.stderr).toBe(0);
    const directRequestSource = await fs.readFile(directAdapter.capture, "utf8");
    const aliasRequestSource = await fs.readFile(aliasAdapter.capture, "utf8");
    expect(aliasRequestSource).toBe(directRequestSource);
    expect(JSON.parse(aliased.stdout)).toEqual(expect.objectContaining({
      command: "scenario.execute",
      execution: expect.objectContaining({
        definition: expect.objectContaining({ scenario: "resolve-question@1" }),
        completion: expect.objectContaining({ contractValid: true, expressionPassed: true }),
      }),
    }));
  }, 30_000);

  it("cannot bypass adapter input and output boundaries", async () => {
    const configured = await repositoryWithQuestion();
    roots.push(configured.root);
    const invalidAdapter = await adapter(
      configured.root,
      { outputs: [], completionEvidence: {} },
      "invalid-adapter",
    );
    const missingArgumentAdapter = await adapter(
      configured.root,
      validResponse(configured.question),
      "missing-argument-not-invoked",
    );
    const before = await treeDigest(path.join(configured.root, ".lifecycle"));
    const missingArgument = req(
      configured.root,
      "question",
      "resolve",
      "--obligation",
      configured.obligation,
      "--adapter",
      missingArgumentAdapter.executable,
      "--json",
    );
    expect(missingArgument.status).toBe(1);
    expect(JSON.parse(missingArgument.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "alias-argument-cardinality-invalid" }),
    ]);
    await expect(fs.stat(missingArgumentAdapter.capture)).rejects.toMatchObject({ code: "ENOENT" });

    const invalidOutput = req(
      configured.root,
      "question",
      "resolve",
      "--obligation",
      configured.obligation,
      "--adapter",
      invalidAdapter.executable,
      "--question",
      configured.question.revisionId,
      "--json",
    );
    expect(invalidOutput.status).toBe(1);
    expect(JSON.parse(invalidOutput.stdout).diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "scenario-output-cardinality-invalid" })]),
    );
    expect(await treeDigest(path.join(configured.root, ".lifecycle"))).toBe(before);

    const prohibitedAdapter = await adapter(
      configured.root,
      validResponse(configured.question),
      "not-invoked",
    );
    const prohibited = req(
      configured.root,
      "question",
      "resolve",
      "--obligation",
      configured.obligation,
      "--adapter",
      prohibitedAdapter.executable,
      "--input",
      "unstated stakeholder answer=guessed",
      "--json",
    );
    expect(prohibited.status).toBe(1);
    expect(JSON.parse(prohibited.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "alias-unknown-argument" }),
    ]);
    await expect(fs.stat(prohibitedAdapter.capture)).rejects.toMatchObject({ code: "ENOENT" });

    const preferential = req(
      configured.root,
      "new",
      "QST",
      "--scenario",
      "resolve-question@1",
      "--set",
      "title=Stakeholder decision",
      "--set",
      "kind=preferential",
      "--set",
      "question=Which preference should govern?",
      "--set",
      "state=open",
      "--set",
      "blocking_impact=An answer must not be fabricated",
      "--json",
    );
    expect(preferential.status, preferential.stderr).toBe(0);
    const preferentialRevision = JSON.parse(preferential.stdout).created.revisionId;
    const secondSeparator = configured.obligation.indexOf(
      ":",
      configured.obligation.indexOf(":") + 1,
    );
    const blockedObligation = `open-question-resolution@2:${preferentialRevision}:${configured.obligation.slice(secondSeparator + 1)}`;
    const blockedAdapter = await adapter(
      configured.root,
      validResponse(configured.question),
      "blocked-not-invoked",
    );
    const beforeBlocked = await treeDigest(path.join(configured.root, ".lifecycle"));
    const blocked = req(
      configured.root,
      "question",
      "resolve",
      "--obligation",
      blockedObligation,
      "--adapter",
      blockedAdapter.executable,
      "--question",
      preferentialRevision,
      "--json",
    );
    expect(blocked.status).toBe(1);
    expect(JSON.parse(blocked.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "obligation-not-dispatchable" }),
    ]);
    await expect(fs.stat(blockedAdapter.capture)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await treeDigest(path.join(configured.root, ".lifecycle"))).toBe(beforeBlocked);
  }, 20_000);

  it.each([
    ["unknown Scenario", { scenario: "missing-scenario@1" }, "unknown-reference"],
    ["unknown Scenario input", { inputs: { missing: "args.question" } }, "alias-unknown-scenario-input"],
    ["unknown argument path", { inputs: { question: "args.missing" } }, "expression-unknown-path"],
    ["wrong typed input shape", { inputs: { question: "[args.question]" } }, "expression-result-type"],
    ["evaluator host call", {
      scenario: "create-candidate-baseline@1",
      arguments: {},
      inputs: { definition_members: 'select("review-required-revisions@1", {})' },
    }, "alias-host-function-forbidden"],
    ["shell or package host call", { inputs: { question: "shell(args.question)" } }, "expression-unknown-binding"],
    ["executable package field", { executable: "./package-script" }, "meta-schema"],
    ["reserved kernel argument", { arguments: { adapter: { cardinality: "one" } } }, "alias-reserved-argument"],
    ["kernel command collision", { id: "scenario.execute" }, "alias-command-conflict"],
  ])("rejects an alias with %s during package validation", async (_case, change, code) => {
    const processRoot = await copiedProcessPackage("mdlm-invalid-alias-");
    roots.push(path.dirname(processRoot));
    const aliasPath = path.join(processRoot, "aliases/question.resolve.yaml");
    const alias = parse(await fs.readFile(aliasPath, "utf8")) as Record<string, unknown>;
    Object.assign(alias, change);
    await fs.writeFile(aliasPath, stringify(alias));
    const repositoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-alias-validation-"));
    roots.push(repositoryRoot);

    const validated = req(
      repositoryRoot,
      "process",
      "validate",
      "--ref",
      processRoot,
      "--json",
    );
    expect(validated.status).toBe(1);
    expect(JSON.parse(validated.stdout).diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code })]),
    );
  });
});

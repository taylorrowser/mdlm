import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

describe("req scenario execute", () => {
  let repositoryRoot: string;
  let question: { id: string; revisionId: string };
  let obligation: string;

  beforeEach(async () => {
    repositoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-scenario-execute-"));
    const initialized = req(repositoryRoot, "init", "--process", bootstrapPackage, "--json");
    expect(initialized.status, initialized.stderr).toBe(0);
    const packageDigest = JSON.parse(initialized.stdout).package.digest;
    const createdQuestion = req(
      repositoryRoot,
      "new",
      "QST",
      "--scenario",
      "resolve-question@1",
      "--set",
      "title=Empirical adapter question",
      "--set",
      "kind=empirical",
      "--set",
      "question=Can an adapter resolve this exact question?",
      "--set",
      "state=open",
      "--set",
      "blocking_impact=Scenario execution remains unproven",
      "--json",
    );
    expect(createdQuestion.status, createdQuestion.stderr).toBe(0);
    question = JSON.parse(createdQuestion.stdout).created;
    obligation = `open-question-resolution@2:${question.revisionId}:mdlm-bootstrap@0.31.0#${packageDigest}`;

    const baseline = req(
      repositoryRoot,
      "baseline",
      "create",
      "--type",
      "BSL",
      "--scenario",
      "create-review-context@1",
      "--set",
      "title=Question source baseline",
      "--set",
      "kind=review-context",
      "--set",
      "role=review-context",
      "--set",
      "scope=question source",
      "--set",
      "group=DEFAULT",
      "--json",
    );
    expect(baseline.status, baseline.stderr).toBe(0);
    const baselineId = JSON.parse(baseline.stdout).created.id;
    expect(req(repositoryRoot, "baseline", "add", baselineId, question.revisionId, "--json").status).toBe(0);
    expect(req(repositoryRoot, "baseline", "freeze", baselineId, "--json").status).toBe(0);
  });

  afterEach(async () => {
    await fs.rm(repositoryRoot, { recursive: true, force: true });
  });

  async function adapter(response: unknown, name = "adapter.mjs"): Promise<{ path: string; capture: string }> {
    const adapterPath = path.join(repositoryRoot, name);
    const capture = path.join(repositoryRoot, `${name}.request.json`);
    await fs.writeFile(
      adapterPath,
      `#!/usr/bin/env node\nimport fs from "node:fs";\nconst input = fs.readFileSync(0, "utf8");\nfs.writeFileSync(${JSON.stringify(capture)}, input);\nprocess.stdout.write(${JSON.stringify(JSON.stringify(response))});\n`,
      { mode: 0o755 },
    );
    return { path: adapterPath, capture };
  }

  function validOutputs() {
    return {
      outputs: [
        {
          name: "decision",
          invocation: 0,
          lifecycleDatum: {
            type: "DEC",
            payload: {
              title: "Resolve adapter question",
              rationale: "The executable adapter boundary was observed.",
              kind: "decision",
              decision: "The configured adapter can resolve an exact question.",
              alternatives: ["Leave scenario execution unproven"],
              effective_scope: "mdlm scenario execution tracer bullet",
            },
            links: [{ type: "resolves", target: question.revisionId }],
            body: "Adapter-produced decision.\n",
          },
        },
        {
          name: "updated_question",
          invocation: 0,
          lifecycleDatum: {
            id: question.id,
            type: "QST",
            payload: {
              title: "Empirical adapter question",
              kind: "empirical",
              question: "Can an adapter resolve this exact question?",
              state: "answered",
              blocking_impact: "Scenario execution remains unproven",
            },
            links: [],
            body: "Resolved by exact execution evidence.\n",
          },
        },
      ],
      completionEvidence: { summary: "The question was answered through bounded execution." },
    };
  }

  it("invokes the adapter with the same repository-backed preparation exposed by dry-run", async () => {
    const dryRunResult = req(
      repositoryRoot,
      "scenario",
      "dry-run",
      "resolve-question@1",
      "--obligation",
      obligation,
      "--input",
      `question=${question.revisionId}`,
      "--json",
    );
    expect(dryRunResult.status, dryRunResult.stderr).toBe(0);
    const preparation = JSON.parse(dryRunResult.stdout).scenarioDryRun;
    const configured = await adapter(validOutputs());
    const result = req(
      repositoryRoot,
      "scenario",
      "execute",
      "resolve-question@1",
      "--obligation",
      obligation,
      "--adapter",
      configured.path,
      "--input",
      `question=${question.revisionId}`,
      "--json",
    );

    expect(result.status, result.stderr).toBe(0);
    const output = JSON.parse(result.stdout);
    const request = JSON.parse(await fs.readFile(configured.capture, "utf8"));
    expect(request).toEqual({
      contract: "mdlm-agent-adapter@1",
      scenario: "resolve-question@1",
      authorization: {
        mode: "dispatchable-obligation",
        obligation,
      },
      obligation,
      invocations: preparation.invocations,
      prompt: preparation.prompt,
      policies: preparation.policies,
      prohibitedInputs: preparation.prohibitedInputs,
      expectedOutputs: preparation.expectedOutputs,
      completion: preparation.completion,
    });
    expect(output.execution.inputs).toEqual(preparation.invocations);
    expect(output.execution).toEqual(expect.objectContaining({
      contract: "mdlm-scenario-execution@1",
      status: "completed",
      authorization: {
        mode: "dispatchable-obligation",
        obligation,
      },
      package: expect.objectContaining({
        reference: "mdlm-bootstrap@0.31.0",
        digest: expect.stringMatching(/^sha256:/),
      }),
      prompt: expect.objectContaining({ reference: "prompts/resolve-question.md@1" }),
      skills: expect.any(Array),
      policies: expect.arrayContaining([
        expect.objectContaining({ reference: "review-applicability@1" }),
        expect.objectContaining({ reference: "waiver-applicability@1" }),
      ]),
      outputs: expect.arrayContaining([
        expect.objectContaining({ name: "decision", lifecycleDatum: expect.objectContaining({ type: "DEC" }) }),
        expect.objectContaining({ name: "updated_question", lifecycleDatum: expect.objectContaining({ id: question.id, revision: 2, type: "QST" }) }),
      ]),
      completion: expect.objectContaining({ contractValid: true, expressionPassed: true }),
      completionEvidence: validOutputs().completionEvidence,
      resultingObligations: expect.any(Array),
      discoveredObligations: [],
    }));

    expect(output.execution.resultingObligations).not.toContain(obligation);
    const executionPath = path.join(
      repositoryRoot,
      ".lifecycle/data/.transactions",
      output.execution.id,
      "execution.json",
    );
    await expect(fs.stat(executionPath)).resolves.toMatchObject({});
    const shown = req(repositoryRoot, "scenario", "execution", "show", output.execution.id, "--json");
    expect(shown.status, shown.stderr).toBe(0);
    expect(JSON.parse(shown.stdout).execution).toEqual(output.execution);
    const human = req(
      repositoryRoot,
      "scenario",
      "execution",
      "show",
      output.execution.id,
    );
    expect(human.status, human.stderr).toBe(0);
    expect(human.stdout).toContain(`Scenario Execution: ${output.execution.id} [completed]`);
    expect(human.stdout).toContain("Completion Passed: true");

    const listed = req(repositoryRoot, "list", "--json");
    const data = JSON.parse(listed.stdout).data;
    const decision = data.find((item: any) => item.lifecycleDatum.datum.type === "DEC");
    expect(decision.lifecycleDatum.datum.created_by).toEqual({
      scenario: "resolve-question@1",
      prompt_ref: "prompts/resolve-question.md@1",
      process_ref: expect.stringContaining("mdlm-bootstrap@0.31.0#sha256:"),
      loaded_skill_refs: request.prompt.skills.map((skill: any) => skill.reference),
      policy_refs: ["review-applicability@1", "waiver-applicability@1"],
    });
    const doctor = req(repositoryRoot, "doctor", "--json");
    expect(doctor.status, doctor.stderr).toBe(0);
  }, 15_000);

  it("rejects prohibited caller input before invoking the configured adapter", async () => {
    const configured = await adapter(validOutputs(), "not-invoked.mjs");
    const before = await treeDigest(path.join(repositoryRoot, ".lifecycle"));
    const result = req(
      repositoryRoot,
      "scenario",
      "execute",
      "resolve-question@1",
      "--obligation",
      obligation,
      "--adapter",
      configured.path,
      "--input",
      "unstated stakeholder answer=fabricated",
      "--json",
    );

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "prohibited-scenario-input" }),
    ]);
    await expect(fs.stat(configured.capture)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await treeDigest(path.join(repositoryRoot, ".lifecycle"))).toBe(before);
  });

  it.each([
    ["undeclared", "scenario-output-undeclared"],
    ["missing", "scenario-output-cardinality-invalid"],
    ["invalid", "scenario-output-schema-invalid"],
    ["incorrectly-linked", "scenario-output-required-link-missing"],
    ["incomplete", "scenario-completion-failed"],
  ])("rejects %s adapter outputs without partial durable mutation", async (_case, code) => {
    const valid = validOutputs();
    const response = _case === "undeclared"
      ? { outputs: [...valid.outputs, { name: "surprise", invocation: 0, lifecycleDatum: valid.outputs[0]!.lifecycleDatum }], completionEvidence: {} }
      : _case === "missing"
        ? { outputs: [valid.outputs[0]], completionEvidence: {} }
        : _case === "invalid"
          ? { outputs: valid.outputs.map((item) => item.name === "decision" ? { ...item, lifecycleDatum: { ...item.lifecycleDatum, payload: {} } } : item), completionEvidence: {} }
          : _case === "incorrectly-linked"
            ? { outputs: valid.outputs.map((item) => item.name === "decision" ? { ...item, lifecycleDatum: { ...item.lifecycleDatum, links: [] } } : item), completionEvidence: {} }
            : { outputs: valid.outputs.map((item) => item.name === "updated_question" ? { ...item, lifecycleDatum: { ...item.lifecycleDatum, payload: { ...item.lifecycleDatum.payload, state: "open" } } } : item), completionEvidence: {} };
    const configured = await adapter(response, `${_case}.mjs`);
    const before = await treeDigest(path.join(repositoryRoot, ".lifecycle"));
    const result = req(
      repositoryRoot,
      "scenario",
      "execute",
      "resolve-question@1",
      "--obligation",
      obligation,
      "--adapter",
      configured.path,
      "--json",
    );
    const after = await treeDigest(path.join(repositoryRoot, ".lifecycle"));

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code })]),
    );
    expect(after).toBe(before);
    await expect(fs.stat(path.join(repositoryRoot, ".lifecycle/data/.transactions"))).rejects.toMatchObject({ code: "ENOENT" });
  }, 15_000);
});

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

describe("req scenario explicit initiation", () => {
  let repositoryRoot: string;

  beforeEach(async () => {
    repositoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-initiate-"));
    const initialized = req(
      repositoryRoot,
      "init",
      "--process",
      bootstrapPackage,
      "--json",
    );
    expect(initialized.status, initialized.stderr).toBe(0);
  });

  afterEach(async () => {
    await fs.rm(repositoryRoot, { recursive: true, force: true });
  });

  async function adapter(
    response: unknown,
    name = "adapter.mjs",
  ): Promise<{ path: string; capture: string }> {
    const adapterPath = path.join(repositoryRoot, name);
    const capture = path.join(repositoryRoot, `${name}.request.json`);
    await fs.writeFile(
      adapterPath,
      `#!/usr/bin/env node\nimport fs from "node:fs";\nconst input = fs.readFileSync(0, "utf8");\nfs.writeFileSync(${JSON.stringify(capture)}, input);\nprocess.stdout.write(${JSON.stringify(JSON.stringify(response))});\n`,
      { mode: 0o755 },
    );
    return { path: adapterPath, capture };
  }

  function createEmpiricalQuestion(): { id: string; revisionId: string } {
    const created = req(
      repositoryRoot,
      "new",
      "QST",
      "--scenario",
      "resolve-question@2",
      "--set",
      "title=Prototype evidence question",
      "--set",
      "kind=empirical",
      "--set",
      "evidence_available=true",
      "--set",
      "question=Does the exact prototype discriminate its unsupported input?",
      "--set",
      "state=open",
      "--set",
      "blocking_impact=Prototype evidence is not yet recorded",
      "--json",
    );
    expect(created.status, `${created.stderr}${created.stdout}`).toBe(0);
    return JSON.parse(created.stdout).created;
  }

  function coherentWayfindingOutputs() {
    return {
      outputs: [
        {
          name: "map",
          invocation: 0,
          lifecycleDatum: {
            id: "MAP-0123456789",
            type: "MAP",
            payload: {
              title: "Temperature converter wayfinding",
              purpose: "Bound the exact prototype pilot decision frontier.",
              frontier: ["Kelvin support remains outside the bounded prototype."],
            },
            links: [
              { type: "indexes", target: "QST-012345678A" },
              { type: "indexes", target: "ART-012345678B" },
            ],
            body: "A linked map of the initial empirical frontier.\n",
          },
        },
        {
          name: "questions",
          invocation: 0,
          lifecycleDatum: {
            id: "QST-012345678A",
            type: "QST",
            payload: {
              title: "Prototype boundary question",
              kind: "empirical",
              question: "Does the exact converter prototype discriminate unsupported Kelvin input?",
              state: "open",
              blocking_impact: "The bounded pilot needs exact prototype evidence.",
            },
            links: [],
            body: "An empirical question bound to the prototype pilot.\n",
          },
        },
        {
          name: "prototype_candidates",
          invocation: 0,
          lifecycleDatum: {
            id: "ART-012345678B",
            type: "ART",
            payload: {
              title: "Temperature converter prototype",
              kind: "prototype",
              repository_ref: "git:5aa48c450047a414586a599b5083f638a7434414",
              supported_behavior: ["Celsius and Fahrenheit conversion"],
              unsupported_behavior: ["Kelvin conversion"],
            },
            links: [{
              type: "derived-from",
              target: "QST-012345678A-r00001",
            }],
            body: "Exact bounded prototype candidate.\n",
          },
        },
      ],
      completionEvidence: {
        summary: "One coherent initial wayfinding batch was prepared.",
      },
    };
  }

  it("prepares an explicitly initiated authored Scenario from durable repository truth", async () => {
    const before = await treeDigest(repositoryRoot);

    const result = req(
      repositoryRoot,
      "scenario",
      "dry-run",
      "chart-wayfinding-map@1",
      "--initiate",
      "--json",
    );

    expect(result.status, result.stderr).toBe(0);
    expect(await treeDigest(repositoryRoot)).toBe(before);
    const output = JSON.parse(result.stdout);
    expect(output).toEqual(expect.objectContaining({
      ok: true,
      command: "scenario.dry-run",
      package: expect.objectContaining({
        reference: "mdlm-bootstrap@0.59.0",
        digest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      }),
      scenarioDryRun: expect.objectContaining({
        executable: true,
        sideEffectFree: true,
        definition: { scenario: "chart-wayfinding-map@1" },
        authorization: { mode: "explicit-initiation" },
        invocations: [{ inputs: [] }],
        policies: [{
          role: "review",
          reference: "review-applicability@1",
          definition: { id: "review-applicability", version: 1 },
        }],
        prohibitedInputs: [
          "generated indexes as lifecycle truth",
          "unstated stakeholder preferences",
        ],
        expectedOutputs: [
          { name: "map", types: ["MAP"], cardinality: "one", requiredLinks: [] },
          { name: "questions", types: ["QST"], cardinality: "zero-or-more", requiredLinks: [] },
          { name: "prototype_candidates", types: ["ART"], cardinality: "zero-or-more", requiredLinks: [] },
        ],
        completion: {
          expression: expect.stringContaining("map.payload.frontier != []"),
          status: "pending-output",
          genericChecks: [
            "declared-output-cardinality",
            "no-undeclared-outputs",
            "output-schema-validity",
            "source-owned-required-links",
          ],
        },
      }),
      diagnostics: [],
    }));

    const prompt = output.scenarioDryRun.prompt;
    expect(prompt).toEqual(expect.objectContaining({
      reference: "prompts/chart-wayfinding-map.md@1",
      content: await fs.readFile(
        path.join(bootstrapPackage, "prompts/chart-wayfinding-map.md"),
        "utf8",
      ),
    }));
    const expectedSkills = [
      "skills/clarification-protocol.md@1",
      "skills/lifecycle-data.md@1",
      "skills/scope-challenge.md@1",
      "skills/wayfinding-map.md@1",
    ];
    expect(prompt.skills.map((skill: { reference: string }) => skill.reference).sort())
      .toEqual(expectedSkills);
    for (const skill of prompt.skills) {
      const relativePath = skill.reference.slice(0, skill.reference.lastIndexOf("@"));
      expect(skill.content).toBe(
        await fs.readFile(path.join(bootstrapPackage, relativePath), "utf8"),
      );
    }
  });
  it("returns exact checks for explicitly supplied lifecycle inputs", () => {
    const question = createEmpiricalQuestion();

    const result = req(
      repositoryRoot,
      "scenario",
      "dry-run",
      "build-exploratory-prototype@1",
      "--initiate",
      "--input",
      `question=${question.revisionId}`,
      "--json",
    );

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).scenarioDryRun.invocations).toEqual([{
      inputs: [{
        name: "question",
        contract: {
          types: ["QST"],
          cardinality: "one",
          identity: "revision",
        },
        values: [expect.objectContaining({
          identity: expect.objectContaining({
            revision_id: question.revisionId,
            type: "QST",
          }),
        })],
        checks: [
          expect.objectContaining({ check: "resolution", passed: true }),
          expect.objectContaining({ check: "cardinality", passed: true }),
          expect.objectContaining({ check: "identity", passed: true }),
          expect.objectContaining({ check: "type", passed: true }),
          expect.objectContaining({
            check: "condition",
            passed: true,
            expected: 'question.payload.kind == "empirical"',
          }),
        ],
      }],
    }]);
  });

  it("atomically publishes one coherent authored batch with explicit-initiation provenance", async () => {
    const prepared = req(
      repositoryRoot,
      "scenario",
      "dry-run",
      "chart-wayfinding-map@1",
      "--initiate",
      "--json",
    );
    expect(prepared.status, prepared.stderr).toBe(0);
    const dryRun = JSON.parse(prepared.stdout).scenarioDryRun;
    const configured = await adapter(coherentWayfindingOutputs());

    const result = req(
      repositoryRoot,
      "scenario",
      "execute",
      "chart-wayfinding-map@1",
      "--initiate",
      "--adapter",
      configured.path,
      "--json",
    );

    expect(result.status, result.stderr).toBe(0);
    const output = JSON.parse(result.stdout);
    const request = JSON.parse(await fs.readFile(configured.capture, "utf8"));
    expect(request).toEqual({
      contract: "mdlm-agent-adapter@1",
      scenario: "chart-wayfinding-map@1",
      authorization: { mode: "explicit-initiation" },
      invocations: dryRun.invocations,
      prompt: dryRun.prompt,
      policies: dryRun.policies,
      prohibitedInputs: dryRun.prohibitedInputs,
      expectedOutputs: dryRun.expectedOutputs,
      completion: dryRun.completion,
    });
    expect(output.execution).toEqual(expect.objectContaining({
      contract: "mdlm-scenario-execution@1",
      status: "completed",
      definition: { scenario: "chart-wayfinding-map@1" },
      authorization: { mode: "explicit-initiation" },
      inputs: dryRun.invocations,
      outputs: expect.arrayContaining([
        expect.objectContaining({ name: "map", lifecycleDatum: expect.objectContaining({ type: "MAP" }) }),
        expect.objectContaining({ name: "questions", lifecycleDatum: expect.objectContaining({ type: "QST" }) }),
        expect.objectContaining({ name: "prototype_candidates", lifecycleDatum: expect.objectContaining({ type: "ART" }) }),
      ]),
      completion: expect.objectContaining({
        contractValid: true,
        expressionPassed: true,
      }),
      completionEvidence: coherentWayfindingOutputs().completionEvidence,
    }));
    expect(output.execution).not.toHaveProperty("obligation");
    expect(output.execution.outputs).toHaveLength(3);

    const transactionRoot = path.join(
      repositoryRoot,
      ".lifecycle/data/.transactions",
      output.execution.id,
    );
    await expect(fs.stat(path.join(transactionRoot, "execution.json")))
      .resolves.toMatchObject({});
    const shown = req(
      repositoryRoot,
      "scenario",
      "execution",
      "show",
      output.execution.id,
    );
    expect(shown.status, shown.stderr).toBe(0);
    expect(shown.stdout).toContain("Authorization: explicit-initiation");
    expect(shown.stdout).not.toContain("Obligation:");
    const listed = req(repositoryRoot, "list", "--json");
    expect(listed.status, listed.stderr).toBe(0);
    expect(JSON.parse(listed.stdout).data).toHaveLength(3);
    const doctor = req(repositoryRoot, "doctor", "--json");
    expect(doctor.status, doctor.stderr).toBe(0);
  }, 15_000);

  it("cannot use explicit initiation to bypass Resolver authorization", async () => {
    const configured = await adapter(
      coherentWayfindingOutputs(),
      "resolver-not-invoked.mjs",
    );

    const result = req(
      repositoryRoot,
      "scenario",
      "execute",
      "resolve-question@2",
      "--initiate",
      "--adapter",
      configured.path,
      "--json",
    );

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).diagnostics).toEqual([{
      code: "scenario-explicit-initiation-prohibited",
      path: "resolve-question@2",
      message: "Scenario 'resolve-question@2' is not declared for explicit initiation",
    }]);
    await expect(fs.stat(configured.capture)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects prohibited initiation input before the adapter boundary", async () => {
    const configured = await adapter(
      coherentWayfindingOutputs(),
      "prohibited-not-invoked.mjs",
    );
    const before = await treeDigest(path.join(repositoryRoot, ".lifecycle"));

    const result = req(
      repositoryRoot,
      "scenario",
      "execute",
      "chart-wayfinding-map@1",
      "--initiate",
      "--adapter",
      configured.path,
      "--input",
      "unstated stakeholder preferences=invented",
      "--json",
    );

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "prohibited-scenario-input" }),
    ]);
    await expect(fs.stat(configured.capture)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await treeDigest(path.join(repositoryRoot, ".lifecycle"))).toBe(before);
  });

it("rejects simultaneous explicit and Obligation authorization", () => {
    const result = req(
      repositoryRoot,
      "scenario",
      "dry-run",
      "chart-wayfinding-map@1",
      "--initiate",
      "--obligation",
      "fabricated-instance",
      "--json",
    );

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "scenario-authorization-ambiguous" }),
    ]);
  });

it.each([
    ["missing mandatory output", "scenario-output-cardinality-invalid"],
    ["invalid cardinality", "scenario-output-cardinality-invalid"],
    ["invalid payload", "scenario-output-schema-invalid"],
  ])("publishes nothing for %s", async (failure, diagnosticCode) => {
    const valid = coherentWayfindingOutputs();
    const response = failure === "missing mandatory output"
      ? { ...valid, outputs: valid.outputs.filter((output) => output.name !== "map") }
      : failure === "invalid cardinality"
        ? { ...valid, outputs: [...valid.outputs, valid.outputs[0]] }
        : {
            ...valid,
            outputs: valid.outputs.map((output) => output.name === "map"
              ? { ...output, lifecycleDatum: { ...output.lifecycleDatum, payload: {} } }
              : output),
          };
    const configured = await adapter(response, `${failure.replaceAll(" ", "-")}.mjs`);
    const before = await treeDigest(path.join(repositoryRoot, ".lifecycle"));

    const result = req(
      repositoryRoot,
      "scenario",
      "execute",
      "chart-wayfinding-map@1",
      "--initiate",
      "--adapter",
      configured.path,
      "--json",
    );

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: diagnosticCode })]),
    );
    expect(await treeDigest(path.join(repositoryRoot, ".lifecycle"))).toBe(before);
    await expect(fs.stat(path.join(
      repositoryRoot,
      ".lifecycle/data/.transactions",
    ))).rejects.toMatchObject({ code: "ENOENT" });
  }, 15_000);

it.each([
    ["bad required links", "scenario-output-required-link-missing"],
    ["failed completion", "scenario-completion-failed"],
  ])("publishes nothing for %s", async (failure, diagnosticCode) => {
    const question = createEmpiricalQuestion();
    const outputs = [
      {
        name: "prototype",
        invocation: 0,
        lifecycleDatum: {
          type: "ART",
          payload: {
            title: "Bounded prototype evidence",
            kind: failure === "failed completion" ? "implementation" : "prototype",
            repository_ref: "git:5aa48c450047a414586a599b5083f638a7434414",
            supported_behavior: ["Celsius and Fahrenheit conversion"],
            unsupported_behavior: ["Kelvin conversion"],
          },
          links: failure === "bad required links"
            ? []
            : [{ type: "derived-from", target: question.revisionId }],
          body: "Exact prototype evidence.\n",
        },
      },
      {
        name: "finding",
        invocation: 0,
        lifecycleDatum: {
          type: "DEC",
          payload: {
            title: "Prototype finding",
            rationale: "The bounded prototype behavior was exercised.",
            kind: "decision",
            decision: "Kelvin remains intentionally unsupported.",
            alternatives: ["Expand the bounded prototype"],
            effective_scope: "temperature converter prototype pilot",
          },
          links: [
            { type: "resolves", target: question.revisionId },
            { type: "resolves", target: `${question.id}-r00002` },
          ],
          body: "Bounded empirical finding.\n",
        },
      },
    ];
    const configured = await adapter(
      { outputs, completionEvidence: { summary: failure } },
      `${failure.replaceAll(" ", "-")}.mjs`,
    );
    const before = await treeDigest(path.join(repositoryRoot, ".lifecycle"));

    const result = req(
      repositoryRoot,
      "scenario",
      "execute",
      "build-exploratory-prototype@1",
      "--initiate",
      "--adapter",
      configured.path,
      "--input",
      `question=${question.revisionId}`,
      "--json",
    );

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: diagnosticCode })]),
    );
    expect(await treeDigest(path.join(repositoryRoot, ".lifecycle"))).toBe(before);
    await expect(fs.stat(path.join(
      repositoryRoot,
      ".lifecycle/data/.transactions",
    ))).rejects.toMatchObject({ code: "ENOENT" });
  }, 15_000);
});

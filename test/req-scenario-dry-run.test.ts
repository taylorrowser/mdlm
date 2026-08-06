import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { req, selectProcessPackage } from "./helpers/req.js";

const bootstrapPackage = path.join(process.cwd(), ".lifecycle/process");
const prototypeSnapshot = path.join(
  process.cwd(),
  "examples/psp-to-sys-snapshot.yaml",
);
const readyInstance =
  "review-context-required@2:PSP-7K3M9Q2D8F-r00001:git:prototype";

async function treeDigest(root: string): Promise<string> {
  const hash = createHash("sha256");
  async function visit(directory: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      const itemPath = path.join(directory, entry.name);
      const relative = path.relative(root, itemPath);
      hash.update(relative);
      hash.update("\0");
      if (entry.isDirectory()) await visit(itemPath);
      else hash.update(await fs.readFile(itemPath));
    }
  }
  await visit(root);
  return hash.digest("hex");
}

async function copiedProcessPackage(prefix: string): Promise<string> {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const processRoot = path.join(temporaryRoot, "process");
  await fs.cp(path.join(process.cwd(), ".lifecycle/process"), processRoot, {
    recursive: true,
  });
  return processRoot;
}

async function packageWithRejectedInput(): Promise<string> {
  const processRoot = await copiedProcessPackage("mdlm-dry-run-package-");
  const scenarioPath = path.join(
    processRoot,
    "scenarios/create-review-context.yaml",
  );
  const scenario = await fs.readFile(scenarioPath, "utf8");
  await fs.writeFile(
    scenarioPath,
    scenario.replace(
      "  - {name: subject, types: [MAP, PSP, STK, SYS, ASP, ICSP, DWP, VSP, ENV, VER, VAI, BSL, DEC, PRB, CHG, PAS], cardinality: one, identity: revision}",
      "  - {name: subject, types: [MAP, PSP, STK, SYS, ASP, ICSP, DWP, VSP, ENV, VER, VAI, BSL, DEC, PRB, CHG, PAS], cardinality: one, identity: revision, conditions: 'subject.integrity.schema_valid == false'}",
    ),
  );
  return processRoot;
}

describe("req scenario dry-run", () => {
  let repositoryRoot: string;

  beforeEach(async () => {
    repositoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-dry-run-"));
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

  it("derives a side-effect-free dry-run from durable repository truth", async () => {
    const shownPackage = req(repositoryRoot, "process", "show", "--json");
    expect(shownPackage.status, shownPackage.stderr).toBe(0);
    const packageDigest = JSON.parse(shownPackage.stdout).package.digest;
    const createdQuestion = req(
      repositoryRoot,
      "new",
      "QST",
      "--scenario",
      "resolve-question@2",
      "--set",
      "title=Repository-backed dry-run",
      "--set",
      "kind=empirical",
      "--set",
      "evidence_available=true",
      "--set",
      "question=Can dry-run use durable repository truth?",
      "--set",
      "state=open",
      "--set",
      "blocking_impact=Resolver preparation requires an exact repository snapshot",
      "--json",
    );
    expect(
      createdQuestion.status,
      `${createdQuestion.stderr}${createdQuestion.stdout}`,
    ).toBe(0);
    const question = JSON.parse(createdQuestion.stdout).created;
    const obligation =
      `open-question-resolution@2:${question.revisionId}:mdlm-bootstrap@0.35.0#${packageDigest}`;
    const before = await treeDigest(repositoryRoot);

    const result = req(
      repositoryRoot,
      "scenario",
      "dry-run",
      "resolve-question@2",
      "--obligation",
      obligation,
      "--json",
    );

    expect(result.status, result.stderr).toBe(0);
    expect(await treeDigest(repositoryRoot)).toBe(before);
    expect(JSON.parse(result.stdout)).toEqual(expect.objectContaining({
      ok: true,
      command: "scenario.dry-run",
      scenarioDryRun: expect.objectContaining({
        executable: true,
        sideEffectFree: true,
        obligation: expect.objectContaining({
          instance: obligation,
          subject: question.revisionId,
          status: "ready",
          dispatchable: true,
        }),
        invocations: [{
          inputs: [expect.objectContaining({
            name: "question",
            checks: expect.arrayContaining([expect.objectContaining({
              check: "resolution",
              expected: "named lifecycle identities from the evaluated snapshot",
            })]),
            values: [expect.objectContaining({
              identity: expect.objectContaining({
                revision_id: question.revisionId,
              }),
            })],
          })],
        }],
        prompt: expect.objectContaining({
          reference: "prompts/resolve-question.md@2",
          content: expect.stringContaining("# Resolve a question"),
          skills: expect.arrayContaining([
            expect.objectContaining({
              reference: "skills/clarification-protocol.md@1",
              content: expect.any(String),
            }),
          ]),
        }),
        policies: expect.arrayContaining([
          expect.objectContaining({ role: "review" }),
          expect.objectContaining({ role: "waiver" }),
        ]),
        prohibitedInputs: [
          "unstated stakeholder answer",
          "unsupported empirical conclusion",
        ],
        expectedOutputs: expect.arrayContaining([
          expect.objectContaining({ name: "decision", cardinality: "zero-or-one" }),
          expect.objectContaining({
            name: "updated_question",
            cardinality: "one",
          }),
        ]),
        completion: expect.objectContaining({
          status: "pending-output",
          expression: expect.stringContaining("contract_valid"),
        }),
      }),
      diagnostics: [],
    }));
  });

  it("resolves an executable Dispatchable Obligation without mutating Lifecycle Data", async () => {
    const before = await treeDigest(repositoryRoot);
    const result = req(
      repositoryRoot,
      "scenario",
      "dry-run",
      "create-review-context@1",
      "--obligation",
      readyInstance,
      "--snapshot",
      prototypeSnapshot,
      "--json",
    );
    const after = await treeDigest(repositoryRoot);

    expect(result.status, result.stderr).toBe(0);
    expect(after).toBe(before);
    const output = JSON.parse(result.stdout);
    expect(output).toEqual(
      expect.objectContaining({
        ok: true,
        command: "scenario.dry-run",
        package: expect.objectContaining({
          reference: "mdlm-bootstrap@0.35.0",
          language: "mdlm-expression@1",
          digest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        }),
        scenarioDryRun: expect.objectContaining({
          executable: true,
          sideEffectFree: true,
          definition: {
            obligation: "review-context-required@2",
            scenario: "create-review-context@1",
          },
          obligation: expect.objectContaining({
            instance: readyInstance,
            subject: "PSP-7K3M9Q2D8F-r00001",
            status: "ready",
            dispatchable: true,
          }),
          invocations: [
            {
              inputs: [
                {
                  name: "subject",
                  contract: {
                    types: [
                      "ASP",
                      "BSL",
                      "CHG",
                      "DEC",
                      "DWP",
                      "ENV",
                      "ICSP",
                      "MAP",
                      "PAS",
                      "PRB",
                      "PSP",
                      "STK",
                      "SYS",
                      "VAI",
                      "VER",
                      "VSP",
                    ],
                    cardinality: "one",
                    identity: "revision",
                  },
                  values: [
                    expect.objectContaining({
                      identity: {
                        id: "PSP-7K3M9Q2D8F",
                        revision_id: "PSP-7K3M9Q2D8F-r00001",
                        type: "PSP",
                        revision: 1,
                      },
                      data: expect.objectContaining({
                        revision_id: "PSP-7K3M9Q2D8F-r00001",
                        type: "PSP",
                      }),
                    }),
                  ],
                  checks: expect.arrayContaining([
                    expect.objectContaining({
                      check: "cardinality",
                      passed: true,
                    }),
                    expect.objectContaining({
                      check: "identity",
                      passed: true,
                    }),
                    expect.objectContaining({ check: "type", passed: true }),
                  ]),
                },
              ],
            },
          ],
          prompt: expect.objectContaining({
            reference: "prompts/create-review-context.md@1",
            path: "prompts/create-review-context.md",
            digest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
            content: expect.stringContaining(
              "# Create an exact review context",
            ),
            skills: [
              expect.objectContaining({
                reference: "skills/lifecycle-data.md@1",
              }),
              expect.objectContaining({
                reference: "skills/traceability.md@1",
              }),
              expect.objectContaining({
                reference: "skills/baseline-model.md@1",
              }),
            ],
          }),
          policies: [
            expect.objectContaining({
              role: "review",
              reference: "review-applicability@1",
              definition: expect.objectContaining({
                id: "review-applicability",
                version: 1,
              }),
            }),
            expect.objectContaining({
              role: "waiver",
              reference: "waiver-applicability@1",
              definition: expect.objectContaining({
                id: "waiver-applicability",
                version: 1,
              }),
            }),
          ],
          prohibitedInputs: [
            "generated indexes as lifecycle truth",
            "mutable latest aliases",
          ],
          expectedOutputs: [
            {
              name: "context",
              types: ["BSL"],
              cardinality: "one",
              requiredLinks: [],
            },
          ],
          completion: expect.objectContaining({
            expression: expect.stringContaining(
              "execution.integrity.contract_valid",
            ),
            status: "pending-output",
            genericChecks: expect.arrayContaining([
              "declared-output-cardinality",
              "output-schema-validity",
              "source-owned-required-links",
              "no-undeclared-outputs",
            ]),
          }),
        }),
        diagnostics: [],
      }),
    );

    const human = req(
      repositoryRoot,
      "scenario",
      "dry-run",
      "create-review-context@1",
      "--obligation",
      readyInstance,
      "--snapshot",
      prototypeSnapshot,
    );
    expect(human.status, human.stderr).toBe(0);
    expect(human.stdout).toContain(
      "Scenario Dry Run: create-review-context@1 [executable]",
    );
    expect(human.stdout).toContain(`Obligation: ${readyInstance}`);
    expect(human.stdout).toContain("Input subject: PSP-7K3M9Q2D8F-r00001");
    expect(human.stdout).toContain(
      "Prompt: prompts/create-review-context.md@1",
    );
    expect(human.stdout).toContain("Policy [review]: review-applicability@1");
    expect(human.stdout).toContain("Completion: pending-output");
  });

  it("rejects non-Dispatchable instances, resolver mismatches, and prohibited access before execution", () => {
    const blockedInstance =
      "passing-review-required@2:PSP-7K3M9Q2D8F-r00001:git:prototype";
    const blocked = req(
      repositoryRoot,
      "scenario",
      "dry-run",
      "review-datum-in-context@2",
      "--obligation",
      blockedInstance,
      "--snapshot",
      prototypeSnapshot,
      "--json",
    );
    expect(blocked.status).toBe(1);
    expect(JSON.parse(blocked.stdout).diagnostics).toEqual([
      expect.objectContaining({
        code: "obligation-not-dispatchable",
        path: blockedInstance,
        message: expect.stringContaining("unresolved bindings review_context"),
      }),
    ]);

    const mismatch = req(
      repositoryRoot,
      "scenario",
      "dry-run",
      "resolve-question@2",
      "--obligation",
      readyInstance,
      "--snapshot",
      prototypeSnapshot,
      "--json",
    );
    expect(mismatch.status).toBe(1);
    expect(JSON.parse(mismatch.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "resolver-scenario-mismatch" }),
    ]);

    const prohibited = req(
      repositoryRoot,
      "scenario",
      "dry-run",
      "create-review-context@1",
      "--obligation",
      readyInstance,
      "--snapshot",
      prototypeSnapshot,
      "--input",
      "mutable latest aliases=latest",
      "--json",
    );
    expect(prohibited.status).toBe(1);
    expect(JSON.parse(prohibited.stdout).diagnostics).toEqual([
      expect.objectContaining({
        code: "prohibited-scenario-input",
        path: "mutable latest aliases",
      }),
    ]);
  });

  it("rejects a package-authored input condition before an adapter boundary", async () => {
    const processRoot = await packageWithRejectedInput();
    const alternateRepository = await fs.mkdtemp(
      path.join(os.tmpdir(), "mdlm-dry-run-condition-"),
    );
    try {
      selectProcessPackage(
        alternateRepository,
        processRoot,
        "mdlm-bootstrap@0.35.0",
      );
      const before = await treeDigest(alternateRepository);
      const result = req(
        alternateRepository,
        "scenario",
        "dry-run",
        "create-review-context@1",
        "--obligation",
        readyInstance,
        "--snapshot",
        prototypeSnapshot,
        "--json",
      );
      const after = await treeDigest(alternateRepository);

      expect(result.status).toBe(1);
      expect(after).toBe(before);
      expect(JSON.parse(result.stdout).diagnostics).toEqual([
        expect.objectContaining({
          code: "scenario-input-condition-failed",
          path: "scenarios.create-review-context.inputs.subject.conditions",
          message: expect.stringContaining("input 'subject'"),
        }),
      ]);
    } finally {
      await fs.rm(alternateRepository, { recursive: true, force: true });
      await fs.rm(path.dirname(processRoot), { recursive: true, force: true });
    }
  });
});

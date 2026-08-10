import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { req, selectBootstrapProcessPackage } from "./helpers/req.js";

const snapshot = path.join(process.cwd(), "examples/psp-to-sys-snapshot.yaml");
const subjectRevision = "PSP-7K3M9Q2D8F-r00001";

describe("req process expression evaluation", () => {
  let repositoryRoot: string;

  beforeEach(async () => {
    repositoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-req-expression-"));
    selectBootstrapProcessPackage(repositoryRoot);
  });

  afterEach(async () => {
    await fs.rm(repositoryRoot, { recursive: true, force: true });
  });

  it("evaluates a definition field with its actual contract and explains traversal", () => {
    const target = "review-context-required@2#satisfied_when";
    const bindings = JSON.stringify({ subject: subjectRevision });
    const result = req(
      repositoryRoot,
      "process",
      "expression",
      "evaluate",
      target,
      "--snapshot",
      snapshot,
      "--bindings",
      bindings,
      "--json",
    );

    expect(result.status, result.stderr).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output).toEqual({
      ok: true,
      command: "process.expression.evaluate",
      package: expect.objectContaining({
        reference: "mdlm-bootstrap@0.51.0",
        language: "mdlm-expression@1",
      }),
      selected: true,
      evaluation: {
        target: {
          definition: "review-context-required@2",
          kind: "obligation-definition",
          field: "satisfied_when",
        },
        contract: {
          expectedType: "boolean",
          bindings: expect.arrayContaining([
            expect.objectContaining({ name: "process", valueType: "object" }),
            expect.objectContaining({
              name: "subject",
              valueType: "entity",
              domainKind: "revision",
            }),
          ]),
        },
        suppliedBindings: {
          subject: {
            identity: {
              id: "PSP-7K3M9Q2D8F",
              revision_id: subjectRevision,
              type: "PSP",
              revision: 1,
            },
          },
        },
        result: false,
        traversedDefinitions: [
          "valid-review-contexts-for@1#query.from.of",
          "mdlm-kernel-process-interface@1#relation.baseline-memberships",
          "valid-review-contexts-for@1",
          "review-context-required@2#satisfied_when",
        ],
        evidence: [
          expect.objectContaining({
            kind: "expression",
            definition: "valid-review-contexts-for@1#query.from.of",
            source: "subject",
          }),
          expect.objectContaining({
            kind: "relation",
            definition: "mdlm-kernel-process-interface@1#relation.baseline-memberships",
            result: [],
          }),
          expect.objectContaining({
            kind: "selector",
            definition: "valid-review-contexts-for@1",
            result: [],
          }),
          {
            kind: "expression",
            definition: "review-context-required@2#satisfied_when",
            source: 'exists("valid-review-contexts-for@1", {subject: subject})',
            span: {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 1, column: 58, offset: 57 },
            },
            result: false,
          },
        ],
      },
      diagnostics: [],
    });

    const human = req(
      repositoryRoot,
      "process",
      "expression",
      "evaluate",
      target,
      "--snapshot",
      snapshot,
      "--bindings",
      bindings,
    );
    expect(human.status, human.stderr).toBe(0);
    expect(human.stdout).toContain(
      "Expression: review-context-required@2#satisfied_when",
    );
    expect(human.stdout).toContain("Expected Type: boolean");
    expect(human.stdout).toContain("Result: false");
    expect(human.stdout).toContain(
      "Relation mdlm-kernel-process-interface@1#relation.baseline-memberships -> []",
    );
    expect(human.stdout).toContain(
      "Source: exists(\"valid-review-contexts-for@1\", {subject: subject}) [1:1-1:58]",
    );
  });

  it("addresses nested expression fields without exposing compiled nodes", () => {
    const result = req(
      repositoryRoot,
      "process",
      "expression",
      "evaluate",
      "review-applicability@1#rules[0].when",
      "--snapshot",
      snapshot,
      "--bindings",
      JSON.stringify({ subject: subjectRevision }),
      "--json",
    );

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(expect.objectContaining({
      ok: true,
      evaluation: expect.objectContaining({
        target: {
          definition: "review-applicability@1",
          kind: "policy-definition",
          field: "rules[0].when",
        },
        contract: expect.objectContaining({ expectedType: "boolean" }),
        result: true,
        traversedDefinitions: ["review-applicability@1#rules[0].when"],
      }),
      diagnostics: [],
    }));
  });

  it("rejects bindings outside the addressed field's actual contract", () => {
    const result = req(
      repositoryRoot,
      "process",
      "expression",
      "evaluate",
      "review-context-required@2#satisfied_when",
      "--snapshot",
      snapshot,
      "--bindings",
      JSON.stringify({ candidate: subjectRevision }),
      "--json",
    );

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: false,
      diagnostics: [{
        code: "mdlm-error",
        message:
          "Unknown expression binding 'candidate'; missing required binding 'subject'",
      }],
    });
  });

  it("rejects a supplied value that does not match the compiled binding type", () => {
    const result = req(
      repositoryRoot,
      "process",
      "expression",
      "evaluate",
      "review-context-required@2#satisfied_when",
      "--snapshot",
      snapshot,
      "--bindings",
      JSON.stringify({ subject: "missing-revision" }),
      "--json",
    );

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: false,
      diagnostics: [{
        code: "mdlm-error",
        message:
          "Expression binding 'subject' requires an entity from the named snapshot",
      }],
    });
  });

  it("directly evaluates relations, Selectors, Policies, Computed States, and Obligations", () => {
    const cases = [
      {
        arguments: [
          "relation",
          "evaluate",
          "baseline-memberships",
          "--from",
          subjectRevision,
        ],
        command: "relation.evaluate",
        target: {
          kind: "relation",
          definition:
            "mdlm-kernel-process-interface@1#relation.baseline-memberships",
        },
        result: [],
        evidenceKind: "relation",
      },
      {
        arguments: [
          "selector",
          "evaluate",
          "valid-review-contexts-for@1",
          "--arg",
          `subject=${subjectRevision}`,
        ],
        command: "selector.evaluate",
        target: {
          kind: "selector",
          definition: "valid-review-contexts-for@1",
        },
        result: [],
        evidenceKind: "selector",
      },
      {
        arguments: [
          "policy",
          "evaluate",
          "review-applicability@1",
          "--arg",
          `subject=${subjectRevision}`,
        ],
        command: "policy.evaluate",
        target: {
          kind: "policy",
          definition: "review-applicability@1",
        },
        result: {
          required: true,
          rubric_ref: "policies/rubrics/bootstrap-review.md@1",
        },
        evidenceKind: "policy",
      },
      {
        arguments: [
          "state",
          "evaluate",
          "validity@2",
          "--subject",
          subjectRevision,
        ],
        command: "state.evaluate",
        target: { kind: "state", definition: "validity@2" },
        result: "valid",
        evidenceKind: "state",
      },
      {
        arguments: [
          "obligation",
          "evaluate",
          "review-context-required@2",
          "--subject",
          subjectRevision,
        ],
        command: "obligation.evaluate",
        target: {
          kind: "obligation",
          definition: "review-context-required@2",
        },
        result: expect.objectContaining({
          obligation: "review-context-required",
          subject: subjectRevision,
          satisfied: false,
          status: "ready",
          dispatchable: true,
        }),
        evidenceKind: "obligation",
      },
    ];

    for (const testCase of cases) {
      const result = req(
        repositoryRoot,
        ...testCase.arguments,
        "--snapshot",
        snapshot,
        "--json",
      );
      expect(result.status, `${testCase.command}: ${result.stderr}\n${result.stdout}`).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output).toEqual({
        ok: true,
        command: testCase.command,
        package: expect.objectContaining({
          reference: "mdlm-bootstrap@0.51.0",
          language: "mdlm-expression@1",
        }),
        selected: true,
        evaluation: {
          target: testCase.target,
          arguments: expect.any(Object),
          result: testCase.result,
          traversedDefinitions: expect.arrayContaining([
            testCase.target.definition,
          ]),
          evidence: expect.arrayContaining([
            expect.objectContaining({
              kind: testCase.evidenceKind,
              definition: testCase.target.definition,
            }),
          ]),
        },
        diagnostics: [],
      });
      if (testCase.command === "obligation.evaluate") {
        expect(output.evaluation.evidence).toEqual(expect.arrayContaining([
          expect.objectContaining({
            kind: "expression",
            definition: "review-context-required@2#satisfied_when",
            source: 'exists("valid-review-contexts-for@1", {subject: subject})',
            result: false,
          }),
          expect.objectContaining({
            kind: "selector",
            definition: "valid-review-contexts-for@1",
          }),
          expect.objectContaining({
            kind: "relation",
            definition:
              "mdlm-kernel-process-interface@1#relation.baseline-memberships",
          }),
        ]));
      }
    }

    const human = req(
      repositoryRoot,
      "state",
      "evaluate",
      "validity@2",
      "--subject",
      subjectRevision,
      "--snapshot",
      snapshot,
    );
    expect(human.status, human.stderr).toBe(0);
    expect(human.stdout).toContain("State: validity@2");
    expect(human.stdout).toContain("Result: \"valid\"");
    expect(human.stdout).toContain(
      "Source: subject.integrity.parseable == false",
    );
    expect(human.stdout).toContain("validity@2#rules[0].when");
  });
});

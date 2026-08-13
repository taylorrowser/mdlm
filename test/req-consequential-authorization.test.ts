import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { stringify } from "yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lifecycleRecord } from "./helpers/lifecycle-record.js";
import {
  copiedProcessPackage,
  suppressPhase0FoundationObligations,
} from "./helpers/process-package.js";
import { req } from "./helpers/req.js";

const processRef = "mdlm-bootstrap@0.59.0#sha256:authorization-test";
const mdlmExecutable = path.join(process.cwd(), "dist/mdlm.js");

function mdlm(repository: string, input: string | undefined, ...arguments_: string[]) {
  return spawnSync(process.execPath, [mdlmExecutable, ...arguments_], {
    cwd: repository,
    encoding: "utf8",
    ...(input === undefined ? {} : { input }),
  });
}

function git(repository: string, ...arguments_: string[]) {
  return spawnSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" });
}

function frozenLifecycleDatum(
  type: string,
  id: string,
  payload: Record<string, unknown>,
  links: { type: string; target: string }[] = [],
) {
  return lifecycleRecord(type, id, payload, {
    links,
    createdBy: { process_ref: processRef },
    storage: { editable: false, frozen: true },
  });
}

describe("exact consequential authorization", () => {
  let repositoryRoot: string;

  beforeEach(async () => {
    repositoryRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "mdlm-consequential-authorization-"),
    );
    const initialized = req(
      repositoryRoot,
      "init",
      "--process",
      path.join(process.cwd(), ".lifecycle/process"),
      "--json",
    );
    expect(initialized.status, initialized.stderr).toBe(0);
  });

  afterEach(async () => {
    await fs.rm(repositoryRoot, { recursive: true, force: true });
  });

  it("rejects direct Review, gate, waiver, delegation, and question authority evidence", () => {
    const attempts = [
      { type: "REV", scenario: "review-datum-in-context@2" },
      { type: "DEC", scenario: "record-gate-signoff@3" },
      { type: "DEC", scenario: "record-consequential-decision@1" },
      { type: "DEC", scenario: "resolve-question@2" },
      { type: "DEC", scenario: "record-pilot-observation@2" },
    ];

    for (const attempt of attempts) {
      const result = req(
        repositoryRoot,
        "new",
        attempt.type,
        "--scenario",
        attempt.scenario,
        "--body",
        "The user said go ahead and the completion summary claimed success.",
        "--json",
      );
      expect(result.status).toBe(1);
      expect(JSON.parse(result.stdout).diagnostics).toEqual([{
        code: "authority-evidence-requires-scenario-execution",
        path: `types.${attempt.type}.lifecycle.authorship`,
        message: expect.stringContaining(
          `Lifecycle type '${attempt.type}' is declared as authority evidence`,
        ),
      }]);
    }

    const listed = req(repositoryRoot, "list", "--json");
    expect(listed.status, listed.stderr).toBe(0);
    expect(JSON.parse(listed.stdout).data).toEqual([]);
  });

  it("requires a public waiver sign-off to link the exact Obligation Instance", async () => {
    const created = req(
      repositoryRoot,
      "new",
      "PSP",
      "--scenario",
      "compile-psp@2",
      "--set",
      "title=Exact waiver target",
      "--set",
      "rationale=Exercise exact waiver publication",
      "--set",
      "problem=Review context is temporarily disproportionate",
      "--set",
      'users=["operator"]',
      "--set",
      'goals=["preserve exact waiver evidence"]',
      "--set",
      'non_goals=["waive replacement revisions"]',
      "--set",
      'success_measures=["only an exact linked waiver publishes"]',
      "--json",
    );
    expect(created.status, created.stderr).toBe(0);
    const target = JSON.parse(created.stdout).created as { revisionId: string };
    const looseEnds = req(
      repositoryRoot,
      "loose-ends",
      "--phase",
      "phase-0-wayfinding",
      "--json",
    );
    expect(looseEnds.status, looseEnds.stderr).toBe(0);
    const obligation = JSON.parse(looseEnds.stdout).looseEnds.items.find(
      (item: { obligation: string; subject: string }) =>
        item.obligation === "review-context-required" &&
        item.subject === target.revisionId,
    ) as { id: string };
    const response = (includeWaives: boolean) => ({
      outputs: [{
        name: "decision",
        invocation: 0,
        lifecycleDatum: {
          type: "DEC",
          payload: {
            title: "Waive one exact context",
            rationale: "The exact temporary waiver was explicitly authorized.",
            kind: "waiver",
            decision: "Waive only this exact Review Context Obligation.",
            alternatives: ["Create the context now"],
            effective_scope: target.revisionId,
            waiver: {
              instance: obligation.id,
              obligation: "review-context-required@2",
              subject: target.revisionId,
              scope: "this-revision",
              expires_when: ["subject-revised"],
            },
          },
          links: [
            { type: "justifies", target: target.revisionId },
            ...(includeWaives
              ? [{ type: "waives", target: obligation.id }]
              : []),
          ],
          body: "Exact stakeholder-authorized waiver.\n",
        },
      }],
      completionEvidence: { summary: "Explicit waiver authority supplied." },
    });
    const execute = async (includeWaives: boolean, name: string) => {
      const adapterPath = path.join(repositoryRoot, `${name}.mjs`);
      await fs.writeFile(
        adapterPath,
        `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify(response(includeWaives)))});\n`,
        { mode: 0o755 },
      );
      return req(
        repositoryRoot,
        "scenario",
        "execute",
        "record-consequential-decision@1",
        "--initiate",
        "--authorize",
        "stakeholder",
        "--adapter",
        adapterPath,
        "--input",
        `subject=${target.revisionId}`,
        "--json",
      );
    };

    const incomplete = await execute(false, "incomplete-waiver");
    expect(incomplete.status).toBe(1);
    expect(JSON.parse(incomplete.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "scenario-output-required-link-missing" }),
    ]);

    const complete = await execute(true, "complete-waiver");
    expect(complete.status, `${complete.stderr}${complete.stdout}`).toBe(0);
    expect(JSON.parse(complete.stdout).execution.outputs[0]).toEqual(
      expect.objectContaining({ name: "decision" }),
    );
  });

  it("applies a standing delegation only with exact scope, validity, and passing Review", async () => {
    const target = frozenLifecycleDatum("PSP", "PSP-7K3M9Q2D8F", {
      title: "Exact delegated target",
      rationale: "Exercise exact delegation scope.",
      problem: "Consequential authority must remain inspectable.",
      users: ["operator"],
      goals: ["authorize one exact target"],
      non_goals: ["authorize later revisions"],
      success_measures: ["only the reviewed delegation selects"],
    });
    const otherTarget = frozenLifecycleDatum("PSP", "PSP-7K3M9Q2D8G", {
      title: "Different target",
      rationale: "Prove scope does not transfer.",
      problem: "Stable lineage must not imply authority.",
      users: ["operator"],
      goals: ["remain unauthorized"],
      non_goals: ["inherit delegation"],
      success_measures: ["selector returns no delegation"],
    });
    const delegation = frozenLifecycleDatum("DEC", "DEC-7K3M9Q2D8F", {
      title: "Delegate one exact review",
      rationale: "A named reviewer may judge only this target in this Scenario.",
      kind: "authority-delegation",
      decision: "Delegate contextual review for this exact target.",
      alternatives: ["Require attended stakeholder review"],
      effective_scope: target.datum.revision_id,
      delegation: {
        authority: "stakeholder",
        delegate: "independent-reviewer",
        scenario: "review-datum-in-context@2",
        expires_when: "target-revised",
        reactivation_requires: "new-delegation-decision",
      },
    }, [{ type: "justifies", target: target.datum.revision_id }]);
    const invalidDelegation = frozenLifecycleDatum("DEC", "DEC-7K3M9Q2D8G", {
      ...delegation.datum.payload,
      title: "Invalid delegation",
      effective_scope: otherTarget.datum.revision_id,
    }, [{ type: "justifies", target: otherTarget.datum.revision_id }]);
    invalidDelegation.integrity.schema_valid = false;
    const invalidDelegationReview = frozenLifecycleDatum("REV", "REV-7K3M9Q2D8G", {
      title: "Invalid delegation review",
      review_kind: "independent",
      rubric_ref: "policies/rubrics/bootstrap-review.md@1",
      summary: "A passing judgment cannot repair invalid Lifecycle Data.",
      findings: [],
      outcome: "pass",
    }, [{ type: "reviews", target: invalidDelegation.datum.revision_id }]);
    const review = frozenLifecycleDatum("REV", "REV-7K3M9Q2D8F", {
      title: "Delegation review",
      review_kind: "independent",
      rubric_ref: "policies/rubrics/bootstrap-review.md@1",
      summary: "The scope and expiry are bounded.",
      findings: [],
      outcome: "pass",
    }, [{ type: "reviews", target: delegation.datum.revision_id }]);
    const snapshotPath = path.join(repositoryRoot, "delegation.yaml");
    const writeSnapshot = async (records: unknown[]) => {
      await fs.writeFile(snapshotPath, stringify({
        processRef,
        phaseId: "phase-0-wayfinding",
        records,
        dependencyComparisons: [],
      }));
    };
    const evaluate = (subject: string, scenario = "review-datum-in-context@2") =>
      req(
        repositoryRoot,
        "selector",
        "evaluate",
        "applicable-authority-delegations-for@1",
        "--snapshot",
        snapshotPath,
        "--arg",
        `target=${subject}`,
        "--arg",
        `scenario=${scenario}`,
        "--arg",
        "authority=stakeholder",
        "--arg",
        "delegate=independent-reviewer",
        "--json",
      );

    await writeSnapshot([target, otherTarget, delegation]);
    const unreviewed = evaluate(target.datum.revision_id);
    expect(unreviewed.status, unreviewed.stderr).toBe(0);
    expect(JSON.parse(unreviewed.stdout).evaluation.result).toEqual([]);

    await writeSnapshot([
      target,
      otherTarget,
      delegation,
      review,
      invalidDelegation,
      invalidDelegationReview,
    ]);
    const applicable = evaluate(target.datum.revision_id);
    expect(applicable.status, applicable.stderr).toBe(0);
    expect(JSON.parse(applicable.stdout).evaluation.result).toEqual([
      expect.objectContaining({
        identity: expect.objectContaining({
          revision_id: delegation.datum.revision_id,
        }),
      }),
    ]);
    expect(JSON.parse(evaluate(otherTarget.datum.revision_id).stdout).evaluation.result)
      .toEqual([]);
    expect(JSON.parse(evaluate(
      target.datum.revision_id,
      "record-gate-signoff@3",
    ).stdout).evaluation.result).toEqual([]);

    delegation.datum.payload.effective_scope = otherTarget.datum.revision_id;
    await writeSnapshot([target, otherTarget, delegation, review]);
    expect(JSON.parse(evaluate(target.datum.revision_id).stdout).evaluation.result)
      .toEqual([]);
    delegation.datum.payload.effective_scope = target.datum.revision_id;

    delegation.datum.links.push({
      type: "justifies",
      target: otherTarget.datum.revision_id,
    });
    await writeSnapshot([target, otherTarget, delegation, review]);
    expect(JSON.parse(evaluate(target.datum.revision_id).stdout).evaluation.result)
      .toEqual([]);
    delegation.datum.links.pop();

    const replacementTarget = lifecycleRecord(
      "PSP",
      target.datum.id,
      { ...target.datum.payload, title: "Replacement delegated target" },
      {
        revision: 2,
        createdBy: { process_ref: processRef },
        storage: { editable: true, frozen: false },
      },
    );
    await writeSnapshot([
      target,
      replacementTarget,
      otherTarget,
      delegation,
      review,
    ]);
    expect(JSON.parse(evaluate(target.datum.revision_id).stdout).evaluation.result)
      .toEqual([]);
  }, 30_000);
});

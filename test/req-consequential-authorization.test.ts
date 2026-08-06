import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { stringify } from "yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lifecycleRecord } from "./helpers/lifecycle-record.js";
import { req } from "./helpers/req.js";

const processRef = "mdlm-bootstrap@0.40.0#sha256:authorization-test";

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

  it("requires standing delegation to declare bounded Scenario, expiry, and reactivation", () => {
    const malformed = req(
      repositoryRoot,
      "new",
      "DEC",
      "--scenario",
      "resolve-question@2",
      "--set",
      "title=Unbounded delegation",
      "--set",
      "rationale=Exercise the public payload boundary",
      "--set",
      "kind=authority-delegation",
      "--set",
      "decision=Delegate authority",
      "--set",
      'alternatives=["Keep authority attended"]',
      "--set",
      "effective_scope=one exact target",
      "--set",
      `delegation=${JSON.stringify({
        authority: "stakeholder",
        delegate: "independent-reviewer",
        scenario: "review-datum-in-context@2",
        expires_when: "target-revised",
      })}`,
      "--json",
    );

    expect(malformed.status).toBe(1);
    expect(JSON.parse(malformed.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "datum-payload" }),
    ]);
  });

  it("lets the operating agent publish an explicitly authorized exact scope DEC", async () => {
    const created = req(
      repositoryRoot,
      "new",
      "PSP",
      "--scenario",
      "compile-psp@2",
      "--set",
      "title=Exact scope target",
      "--set",
      "rationale=Bound one consequential scope choice",
      "--set",
      "problem=The authorized scope is undecided",
      "--set",
      'users=["operator"]',
      "--set",
      'goals=["record exact scope"]',
      "--set",
      'non_goals=["authorize replacements"]',
      "--set",
      'success_measures=["one exact DEC is published"]',
      "--json",
    );
    expect(created.status, created.stderr).toBe(0);
    const target = JSON.parse(created.stdout).created as { revisionId: string };
    const adapterPath = path.join(repositoryRoot, "scope-adapter.mjs");
    await fs.writeFile(
      adapterPath,
      `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify({
        outputs: [{
          name: "decision",
          invocation: 0,
          lifecycleDatum: {
            type: "DEC",
            payload: {
              title: "Authorize exact scope",
              rationale: "The stakeholder selected this bounded scope.",
              kind: "scope",
              decision: "Use only this exact product scope.",
              alternatives: ["Revise the product scope"],
              effective_scope: target.revisionId,
            },
            links: [{ type: "justifies", target: target.revisionId }],
            body: "Exact stakeholder-authorized scope.\\n",
          },
        }],
        completionEvidence: { summary: "Explicit authority supplied." },
      }))});\n`,
      { mode: 0o755 },
    );

    const executed = req(
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

    expect(executed.status, `${executed.stderr}${executed.stdout}`).toBe(0);
    expect(JSON.parse(executed.stdout).execution).toEqual(expect.objectContaining({
      contract: "mdlm-scenario-execution@3",
      authority: expect.objectContaining({ supplied: ["stakeholder"] }),
      outputs: [expect.objectContaining({
        name: "decision",
        lifecycleDatum: expect.objectContaining({ type: "DEC" }),
      })],
    }));
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

  it("uses only an applicable exact standing delegation to authorize Review execution", async () => {
    const created = req(
      repositoryRoot,
      "new",
      "PSP",
      "--scenario",
      "compile-psp@2",
      "--set",
      "title=Standing delegation target",
      "--set",
      "rationale=Exercise delegated execution",
      "--set",
      "problem=Reviewer authority must be exact",
      "--set",
      'users=["operator"]',
      "--set",
      'goals=["execute one delegated review"]',
      "--set",
      'non_goals=["authorize replacement revisions"]',
      "--set",
      'success_measures=["the exact delegation appears in execution provenance"]',
      "--json",
    );
    expect(created.status, created.stderr).toBe(0);
    const target = JSON.parse(created.stdout).created as {
      id: string;
      revisionId: string;
    };
    const delegationAdapterPath = path.join(repositoryRoot, "delegation-adapter.mjs");
    await fs.writeFile(
      delegationAdapterPath,
      `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify({
        outputs: [{
          name: "decision",
          invocation: 0,
          lifecycleDatum: {
            type: "DEC",
            payload: {
              title: "Delegate exact contextual Review",
              rationale: "Authorize one reviewer for one target and Scenario",
              kind: "authority-delegation",
              decision: "Delegate this exact Review",
              alternatives: ["Require a per-execution reviewer assertion"],
              effective_scope: target.revisionId,
              delegation: {
                authority: "stakeholder",
                delegate: "independent-reviewer",
                scenario: "review-datum-in-context@2",
                expires_when: "target-revised",
                reactivation_requires: "new-delegation-decision",
              },
            },
            links: [{ type: "justifies", target: target.revisionId }],
            body: "Exact standing delegation.\\n",
          },
        }],
        completionEvidence: { summary: "Stakeholder authorized exact delegation." },
      }))});\n`,
      { mode: 0o755 },
    );
    const delegation = req(
      repositoryRoot,
      "scenario",
      "execute",
      "record-consequential-decision@1",
      "--initiate",
      "--authorize",
      "stakeholder",
      "--adapter",
      delegationAdapterPath,
      "--input",
      `subject=${target.revisionId}`,
      "--json",
    );
    expect(delegation.status, delegation.stderr).toBe(0);
    const delegationDatum = JSON.parse(delegation.stdout).execution.outputs[0]
      .lifecycleDatum as { revisionId: string };
    const context = req(
      repositoryRoot,
      "baseline",
      "create",
      "--type",
      "BSL",
      "--scenario",
      "create-review-context@1",
      "--set",
      "title=Delegated Review context",
      "--set",
      "kind=review-context",
      "--set",
      "role=review-context",
      "--set",
      `scope=${target.revisionId}`,
      "--set",
      "group=DEFAULT",
      "--json",
    );
    expect(context.status, context.stderr).toBe(0);
    const contextDatum = JSON.parse(context.stdout).created as {
      id: string;
      revisionId: string;
    };
    for (const member of [target.revisionId, delegationDatum.revisionId]) {
      expect(req(
        repositoryRoot,
        "baseline",
        "add",
        contextDatum.id,
        member,
        "--json",
      ).status).toBe(0);
    }
    expect(req(
      repositoryRoot,
      "baseline",
      "freeze",
      contextDatum.id,
      "--json",
    ).status).toBe(0);
    const delegationLooseEnds = req(
      repositoryRoot,
      "loose-ends",
      "--phase",
      "phase-0-wayfinding",
      "--json",
    );
    expect(
      delegationLooseEnds.status,
      `${delegationLooseEnds.stderr}${delegationLooseEnds.stdout}`,
    ).toBe(0);
    const delegationReviewWork = JSON.parse(
      delegationLooseEnds.stdout,
    ).looseEnds.items.find(
      (item: { obligation: string; subject: string }) =>
        item.obligation === "passing-review-required" &&
        item.subject === delegationDatum.revisionId,
    ) as { id: string };
    const delegationReviewAdapterPath = path.join(
      repositoryRoot,
      "delegation-review-adapter.mjs",
    );
    await fs.writeFile(
      delegationReviewAdapterPath,
      `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify({
        outputs: [{
          name: "review",
          invocation: 0,
          lifecycleDatum: {
            type: "REV",
            payload: {
              title: "Standing delegation Review",
              review_kind: "contextual",
              rubric_ref: "policies/rubrics/bootstrap-review.md@1",
              findings: [],
              outcome: "pass",
            },
            links: [
              { type: "reviews", target: delegationDatum.revisionId },
              { type: "contextualizes", target: contextDatum.revisionId },
            ],
            body: "The exact standing delegation passes Review.\\n",
          },
        }],
        completionEvidence: { summary: "Independent Review passed." },
      }))});\n`,
      { mode: 0o755 },
    );
    const delegationReview = req(
      repositoryRoot,
      "scenario",
      "execute",
      "review-datum-in-context@2",
      "--obligation",
      delegationReviewWork.id,
      "--authorize",
      "independent-reviewer",
      "--adapter",
      delegationReviewAdapterPath,
      "--input",
      `subject=${delegationDatum.revisionId}`,
      "--input",
      `review_context=${contextDatum.revisionId}`,
      "--json",
    );
    expect(
      delegationReview.status,
      `${delegationReview.stderr}${delegationReview.stdout}`,
    ).toBe(0);
    const looseEnds = req(
      repositoryRoot,
      "loose-ends",
      "--phase",
      "phase-0-wayfinding",
      "--json",
    );
    expect(looseEnds.status, looseEnds.stderr).toBe(0);
    const reviewWork = JSON.parse(looseEnds.stdout).looseEnds.items.find(
      (item: { obligation: string; subject: string }) =>
        item.obligation === "passing-review-required" &&
        item.subject === target.revisionId,
    ) as { id: string };
    const delegatedDryRun = req(
      repositoryRoot,
      "scenario",
      "dry-run",
      "review-datum-in-context@2",
      "--obligation",
      reviewWork.id,
      "--input",
      `subject=${target.revisionId}`,
      "--input",
      `review_context=${contextDatum.revisionId}`,
      "--json",
    );
    expect(delegatedDryRun.status, delegatedDryRun.stderr).toBe(0);
    expect(JSON.parse(delegatedDryRun.stdout).scenarioDryRun.standingDelegation)
      .toEqual({
        selector: "applicable-authority-delegations-for@1",
        authority: "stakeholder",
        delegate: "independent-reviewer",
        targetInput: "subject",
        invocations: [{
          invocation: 0,
          target: target.revisionId,
          applicableEvidence: [delegationDatum.revisionId],
        }],
      });

    const adapterPath = path.join(repositoryRoot, "delegated-review.mjs");
    await fs.writeFile(
      adapterPath,
      `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify({
        outputs: [{
          name: "review",
          invocation: 0,
          lifecycleDatum: {
            type: "REV",
            payload: {
              title: "Delegated contextual Review",
              review_kind: "contextual",
              rubric_ref: "policies/rubrics/bootstrap-review.md@1",
              findings: [],
              outcome: "pass",
            },
            links: [
              { type: "reviews", target: target.revisionId },
              { type: "contextualizes", target: contextDatum.revisionId },
            ],
            body: "The exact delegated Review passes.\\n",
          },
        }],
        completionEvidence: { summary: "Applicable standing delegation used." },
      }))});\n`,
      { mode: 0o755 },
    );
    const executed = req(
      repositoryRoot,
      "scenario",
      "execute",
      "review-datum-in-context@2",
      "--obligation",
      reviewWork.id,
      "--delegation",
      delegationDatum.revisionId,
      "--adapter",
      adapterPath,
      "--input",
      `subject=${target.revisionId}`,
      "--input",
      `review_context=${contextDatum.revisionId}`,
      "--json",
    );

    expect(executed.status, `${executed.stderr}${executed.stdout}`).toBe(0);
    expect(JSON.parse(executed.stdout).execution.authority).toEqual(
      expect.objectContaining({
        supplied: [],
        delegations: [delegationDatum.revisionId],
      }),
    );
  }, 15_000);

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
      "record-gate-signoff@2",
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
  }, 10_000);
});

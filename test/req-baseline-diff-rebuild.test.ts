import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renamedBaselineProcessPackage } from "./helpers/process-package.js";
import { req } from "./helpers/req.js";

describe("req baseline differences and repository projection rebuilding", () => {
  let repositoryRoot: string;
  let processRoot: string;

  beforeEach(async () => {
    repositoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-diff-repo-"));
    processRoot = await renamedBaselineProcessPackage("mdlm-diff-process-");
    const initialized = req(
      repositoryRoot,
      "init",
      "--process",
      processRoot,
      "--json",
    );
    expect(initialized.status, initialized.stderr).toBe(0);
  });

  afterEach(async () => {
    await Promise.all([
      fs.rm(repositoryRoot, { recursive: true, force: true }),
      fs.rm(path.dirname(processRoot), { recursive: true, force: true }),
    ]);
  });

  function createPsp(title: string) {
    const result = req(
      repositoryRoot,
      "new",
      "PSP",
      "--scenario",
      "compile-psp@2",
      "--set",
      `title=${title}`,
      "--set",
      "rationale=Exact comparisons preserve lifecycle meaning",
      "--set",
      "problem=Changes are otherwise opaque",
      "--set",
      'users=["lifecycle author"]',
      "--set",
      'goals=["typed baseline differences"]',
      "--set",
      "non_goals=[]",
      "--set",
      'success_measures=["every changed dependency is explained"]',
      "--json",
    );
    expect(result.status, result.stderr).toBe(0);
    return JSON.parse(result.stdout).created as {
      id: string;
      revisionId: string;
      path: string;
    };
  }

  function createRequirement(productId: string) {
    const result = req(
      repositoryRoot,
      "new",
      "STK",
      "--scenario",
      "draft-stakeholder-requirements@2",
      "--set",
      "title=Before requirement",
      "--set",
      "rationale=Typed changes support reassessment",
      "--set",
      "statement=The product shall explain exact baseline changes.",
      "--set",
      "verification_intent=Inspect the exact change record.",
      "--set",
      "stakeholder=lifecycle author",
      "--set",
      "priority=must",
      "--link",
      `derived-from=${productId}`,
      "--json",
    );
    expect(result.status, result.stderr).toBe(0);
    return JSON.parse(result.stdout).created as {
      id: string;
      revisionId: string;
      path: string;
    };
  }

  function createEvidence(title: string) {
    const result = req(
      repositoryRoot,
      "new",
      "QST",
      "--scenario",
      "compile-psp@2",
      "--set",
      `title=${title}`,
      "--set",
      "kind=preferential",
      "--set",
      "question=Does this evidence remain applicable?",
      "--set",
      "state=answered",
      "--set",
      "blocking_impact=Reassessment is required",
      "--json",
    );
    expect(result.status, result.stderr).toBe(0);
    return JSON.parse(result.stdout).created as {
      id: string;
      revisionId: string;
      path: string;
    };
  }

  function createBaseline(title: string, kind = "group-candidate") {
    const result = req(
      repositoryRoot,
      "baseline",
      "create",
      "--type",
      "SNP",
      "--scenario",
      "create-candidate-baseline@1",
      "--set",
      `title=${title}`,
      "--set",
      `kind=${kind}`,
      "--set",
      "role=candidate",
      "--set",
      `scope=${title}`,
      "--set",
      "group=DEFAULT",
      "--json",
    );
    expect(result.status, result.stderr).toBe(0);
    return JSON.parse(result.stdout).created as {
      id: string;
      revisionId: string;
      path: string;
    };
  }

  function baseline(...arguments_: string[]) {
    return req(repositoryRoot, "baseline", ...arguments_, "--json");
  }

  it("classifies exact changes and derives package explanations without treating process drift as Staleness", async () => {
    const product = createPsp("Resolution target");
    const requirement = createRequirement(product.id);
    const oldEvidence = createEvidence("Old evidence");
    const oldComponent = createBaseline("Old component");
    expect(baseline("add", oldComponent.id, product.revisionId).status).toBe(0);
    expect(baseline("freeze", oldComponent.id).status).toBe(0);
    const oldBaseline = createBaseline("Old level", "level-candidate");
    expect(baseline("add", oldBaseline.id, requirement.revisionId).status).toBe(0);
    expect(baseline("evidence", "add", oldBaseline.id, oldEvidence.revisionId).status).toBe(0);
    expect(baseline("compose", oldBaseline.id, oldComponent.revisionId).status).toBe(0);
    expect(baseline("freeze", oldBaseline.id).status).toBe(0);

    const revisedProduct = req(repositoryRoot, "revise", product.id, "--json");
    expect(revisedProduct.status, revisedProduct.stderr).toBe(0);
    const revisedRequirement = req(
      repositoryRoot,
      "revise",
      requirement.id,
      "--json",
    );
    expect(revisedRequirement.status, revisedRequirement.stderr).toBe(0);
    const nextRequirement = JSON.parse(revisedRequirement.stdout).created as {
      revisionId: string;
      path: string;
    };
    const nextRequirementPath = path.join(repositoryRoot, nextRequirement.path);
    await fs.writeFile(
      nextRequirementPath,
      (await fs.readFile(nextRequirementPath, "utf8")).replace(
        "title: Before requirement",
        "title: After requirement",
      ),
    );

    const newEvidence = createEvidence("New evidence");
    const newComponent = createBaseline("New component");
    expect(baseline(
      "add",
      newComponent.id,
      JSON.parse(revisedProduct.stdout).created.revisionId,
    ).status).toBe(0);
    expect(baseline("freeze", newComponent.id).status).toBe(0);
    const newBaseline = createBaseline("New level", "level-candidate");
    expect(baseline("add", newBaseline.id, nextRequirement.revisionId).status).toBe(0);
    expect(baseline("evidence", "add", newBaseline.id, newEvidence.revisionId).status).toBe(0);
    expect(baseline("compose", newBaseline.id, newComponent.revisionId).status).toBe(0);
    const superseded = req(
      repositoryRoot,
      "link",
      newBaseline.revisionId,
      oldBaseline.revisionId,
      "--type",
      "supersedes",
      "--json",
    );
    expect(superseded.status, superseded.stderr).toBe(0);
    expect(baseline("freeze", newBaseline.id).status).toBe(0);

    const oldPath = path.join(repositoryRoot, oldBaseline.path);
    const oldSource = await fs.readFile(oldPath, "utf8");
    await fs.writeFile(
      oldPath,
      oldSource.replace(
        /process_ref: mdlm-bootstrap@0\.54\.0#sha256:[a-f0-9]{64}/,
        `process_ref: historical-process@1.0.0#sha256:${"a".repeat(64)}`,
      ),
    );

    const result = baseline(
      "diff",
      oldBaseline.revisionId,
      newBaseline.revisionId,
    );
    expect(result.status, result.stderr).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.baselineDiff).toMatchObject({
      beforeBaseline: oldBaseline.revisionId,
      afterBaseline: newBaseline.revisionId,
    });
    expect(output.baselineDiff.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        record_version: "dependency-change@1",
        kind: "content-change",
        subject_revision: nextRequirement.revisionId,
        path: "payload.title",
        before: "Before requirement",
        after: "After requirement",
      }),
      expect.objectContaining({
        kind: "outbound-link-change",
        subject_revision: newBaseline.revisionId,
        link_type: "supersedes",
        before_targets: [],
        after_targets: [oldBaseline.revisionId],
      }),
      expect.objectContaining({
        kind: "stable-link-resolution-change",
        subject_revision: nextRequirement.revisionId,
        stable_target: product.id,
        before_target_revision: product.revisionId,
        after_target_revision: JSON.parse(revisedProduct.stdout).created.revisionId,
      }),
      expect.objectContaining({
        kind: "baseline-membership-change",
        removed_members: [requirement.revisionId],
        added_members: [nextRequirement.revisionId],
      }),
      expect.objectContaining({
        kind: "baseline-composition-change",
        removed_components: [oldComponent.revisionId],
        added_components: [newComponent.revisionId],
      }),
      expect.objectContaining({
        kind: "evidence-target-change",
        removed_evidence: [oldEvidence.revisionId],
        added_evidence: [newEvidence.revisionId],
      }),
      expect.objectContaining({
        kind: "process-provenance-change",
        before_process_ref: expect.stringContaining("historical-process@1.0.0"),
        after_process_ref: expect.stringContaining("mdlm-bootstrap@0.55.0"),
      }),
    ]));
    expect(output.baselineDiff.processDrift).toEqual([
      expect.objectContaining({ kind: "process-provenance-change" }),
    ]);
    expect(output.baselineDiff.subjects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        subjectRevision: newBaseline.revisionId,
        states: expect.objectContaining({ validity: "stale" }),
        stateExplanations: expect.objectContaining({
          validity: expect.stringContaining("baseline-membership-change"),
        }),
        changes: expect.arrayContaining([
          expect.objectContaining({ kind: "baseline-membership-change" }),
        ]),
      }),
      expect.objectContaining({
        subjectRevision: nextRequirement.revisionId,
        states: expect.objectContaining({ validity: "stale" }),
        stateExplanations: expect.objectContaining({
          validity: expect.stringContaining("content-change"),
        }),
      }),
    ]));
    expect(output.baselineDiff.subjects.find(
      (subject: { subjectRevision: string }) =>
        subject.subjectRevision === newBaseline.revisionId,
    ).stateExplanations.validity).not.toContain("process-provenance-change");

    const repeated = baseline(
      "diff",
      oldBaseline.revisionId,
      newBaseline.revisionId,
    );
    expect(JSON.parse(repeated.stdout)).toEqual(output);

    const human = req(
      repositoryRoot,
      "baseline",
      "diff",
      oldBaseline.revisionId,
      newBaseline.revisionId,
    );
    expect(human.status, human.stderr).toBe(0);
    expect(human.stdout).toContain(
      `Baseline Diff: ${oldBaseline.revisionId} → ${newBaseline.revisionId}`,
    );
    expect(human.stdout).toContain("process-provenance-change [informational]");
    expect(human.stdout).toContain("validity: stale");

    const doctor = req(repositoryRoot, "doctor", "--json");
    expect(doctor.status, doctor.stderr).toBe(0);
    expect(JSON.parse(doctor.stdout).baselineRepositoryVerification).toEqual({
      verifiedBaselines: 4,
      processDrift: 1,
    });
  }, 60_000);

  it("lets package-authored reassessment rules treat informational process drift as Staleness", async () => {
    await fs.rm(repositoryRoot, { recursive: true, force: true });
    await fs.mkdir(repositoryRoot);
    const selectorPath = path.join(
      processRoot,
      "selectors/staleness-relevant-dependency-changes-for.yaml",
    );
    await fs.writeFile(
      selectorPath,
      (await fs.readFile(selectorPath, "utf8")).replace(
        '"evidence-target-change", "review-context-change"]',
        '"evidence-target-change", "review-context-change",\n    "process-provenance-change"]',
      ),
    );
    const initialized = req(
      repositoryRoot,
      "init",
      "--process",
      processRoot,
      "--json",
    );
    expect(initialized.status, initialized.stderr).toBe(0);

    const before = createBaseline("Process drift");
    const after = createBaseline("Process drift");
    expect(baseline("freeze", before.id).status).toBe(0);
    expect(baseline("freeze", after.id).status).toBe(0);
    const beforePath = path.join(repositoryRoot, before.path);
    await fs.writeFile(
      beforePath,
      (await fs.readFile(beforePath, "utf8")).replace(
        /process_ref: mdlm-bootstrap@0\.54\.0#sha256:[a-f0-9]{64}/,
        `process_ref: historical-process@1.0.0#sha256:${"b".repeat(64)}`,
      ),
    );

    const compared = baseline("diff", before.revisionId, after.revisionId);
    expect(compared.status, compared.stderr).toBe(0);
    const diff = JSON.parse(compared.stdout).baselineDiff;
    expect(diff.processDrift).toEqual([
      expect.objectContaining({ kind: "process-provenance-change" }),
    ]);
    expect(diff.subjects).toEqual([
      expect.objectContaining({
        subjectRevision: after.revisionId,
        states: expect.objectContaining({ validity: "stale" }),
        stateExplanations: expect.objectContaining({
          validity: expect.stringContaining("process-provenance-change"),
        }),
        changes: [expect.objectContaining({
          kind: "process-provenance-change",
        })],
      }),
    ]);
  }, 15_000);

  it("rebuilds disposable indexes and reports, and doctor fails before changing them when durable integrity fails", async () => {
    const product = createPsp("Doctor target");
    const baselineDatum = createBaseline("Doctor baseline");
    expect(baseline("add", baselineDatum.id, product.revisionId).status).toBe(0);
    expect(baseline("freeze", baselineDatum.id).status).toBe(0);

    const initial = req(repositoryRoot, "doctor", "--json");
    expect(initial.status, initial.stderr).toBe(0);
    expect(JSON.parse(initial.stdout)).toMatchObject({
      ok: true,
      command: "doctor",
      index: {
        path: ".lifecycle/generated/indexes/data.json",
        rebuilt: true,
      },
      report: {
        path: ".lifecycle/generated/reports/lifecycle.json",
        rebuilt: true,
      },
      baselineRepositoryVerification: {
        verifiedBaselines: 1,
        processDrift: 0,
      },
    });
    const beforeDeletion = req(repositoryRoot, "show", product.id, "--json");
    await fs.rm(path.join(repositoryRoot, ".lifecycle/generated"), {
      recursive: true,
      force: true,
    });
    const afterDeletion = req(repositoryRoot, "show", product.id, "--json");
    expect(JSON.parse(afterDeletion.stdout)).toEqual(JSON.parse(beforeDeletion.stdout));

    const rebuilt = req(repositoryRoot, "doctor", "--json");
    expect(rebuilt.status, rebuilt.stderr).toBe(0);
    expect(JSON.parse(rebuilt.stdout)).toMatchObject({
      index: { rebuilt: true },
      report: { rebuilt: true },
    });
    const indexPath = path.join(
      repositoryRoot,
      ".lifecycle/generated/indexes/data.json",
    );
    const reportPath = path.join(
      repositoryRoot,
      ".lifecycle/generated/reports/lifecycle.json",
    );
    const generatedBeforeFailure = {
      index: await fs.readFile(indexPath, "utf8"),
      report: await fs.readFile(reportPath, "utf8"),
    };

    const memberPath = path.join(repositoryRoot, product.path);
    const memberBefore = await fs.readFile(memberPath, "utf8");
    await fs.writeFile(memberPath, `${memberBefore}changed frozen byte\n`);
    const unhealthy = req(repositoryRoot, "doctor", "--json");
    expect(unhealthy.status).toBe(1);
    expect(JSON.parse(unhealthy.stdout).diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({
        code: "baseline-hash-mismatch",
        path: product.revisionId,
      })]),
    );
    expect(await fs.readFile(indexPath, "utf8")).toBe(
      generatedBeforeFailure.index,
    );
    expect(await fs.readFile(reportPath, "utf8")).toBe(
      generatedBeforeFailure.report,
    );

    await fs.writeFile(memberPath, memberBefore);
    const descriptorPath = path.join(
      repositoryRoot,
      ".lifecycle/repository.json",
    );
    const descriptor = JSON.parse(await fs.readFile(descriptorPath, "utf8"));
    descriptor.package.digest = `sha256:${"0".repeat(64)}`;
    await fs.writeFile(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`);
    const incompatible = req(repositoryRoot, "doctor", "--json");
    expect(incompatible.status).toBe(1);
    expect(JSON.parse(incompatible.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "repository-contract-mismatch" }),
    ]);
  }, 20_000);
});

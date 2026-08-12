import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renamedBaselineProcessPackage } from "./helpers/process-package.js";
import { req } from "./helpers/req.js";

describe("req exact-baseline@1 capability commands", () => {
  let repositoryRoot: string;
  let processRoot: string;

  beforeEach(async () => {
    repositoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-baseline-repo-"));
    processRoot = await renamedBaselineProcessPackage("mdlm-baseline-process-");
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

  function createProductSpecification() {
    const result = req(
      repositoryRoot,
      "new",
      "PSP",
      "--scenario",
      "compile-psp@2",
      "--set",
      "title=Exact snapshot target",
      "--set",
      "rationale=Stable links need exact freeze-time resolution",
      "--set",
      "problem=Mutable aliases cannot support historical claims",
      "--set",
      'users=["lifecycle author"]',
      "--set",
      'goals=["verify exact baselines"]',
      "--set",
      "non_goals=[]",
      "--set",
      'success_measures=["changed bytes are detected"]',
      "--body",
      "Exact product bytes.",
      "--json",
    );
    expect(result.status, result.stderr).toBe(0);
    return JSON.parse(result.stdout).created;
  }

  function createDefinition(productId: string) {
    const result = req(
      repositoryRoot,
      "new",
      "STK",
      "--scenario",
      "draft-stakeholder-requirements@2",
      "--set",
      "title=Capability-bound baseline",
      "--set",
      "rationale=The kernel must not recognize a baseline type ID",
      "--set",
      "statement=The repository shall freeze exact definition bytes.",
      "--set",
      "verification_intent=Change one frozen file and verify the baseline.",
      "--set",
      "stakeholder=lifecycle author",
      "--set",
      "priority=must",
      "--link",
      `derived-from=${productId}`,
      "--body",
      "Exact definition bytes.",
      "--json",
    );
    expect(result.status, result.stderr).toBe(0);
    return JSON.parse(result.stdout).created;
  }

  function createEvidence() {
    const result = req(
      repositoryRoot,
      "new",
      "QST",
      "--scenario",
      "compile-psp@2",
      "--set",
      "title=Snapshot evidence",
      "--set",
      "kind=preferential",
      "--set",
      "question=Are exact bytes preserved?",
      "--set",
      "state=answered",
      "--set",
      "blocking_impact=Baseline trust would be lost",
      "--body",
      "Exact evidence bytes.",
      "--json",
    );
    expect(result.status, result.stderr).toBe(0);
    return JSON.parse(result.stdout).created;
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
    return JSON.parse(result.stdout).created;
  }

  function baselineCommand(...arguments_: string[]) {
    return req(repositoryRoot, "baseline", ...arguments_, "--json");
  }

  it("creates, populates, composes, freezes, and verifies a differently named bound type", async () => {
    const product = createProductSpecification();
    const definition = createDefinition(product.id);
    const evidence = createEvidence();
    const component = createBaseline("Component baseline");
    const componentMember = baselineCommand(
      "add",
      component.id,
      product.revisionId,
    );
    expect(componentMember.status, componentMember.stderr).toBe(0);

    const componentFrozen = baselineCommand("freeze", component.id);
    expect(componentFrozen.status, componentFrozen.stderr).toBe(0);

    const baseline = createBaseline("Level baseline", "level-candidate");
    const added = baselineCommand("add", baseline.id, definition.revisionId);
    const evidenceAdded = baselineCommand(
      "evidence",
      "add",
      baseline.id,
      evidence.revisionId,
    );
    const composed = baselineCommand(
      "compose",
      baseline.id,
      component.revisionId,
    );
    for (const result of [added, evidenceAdded, composed]) {
      expect(result.status, result.stderr).toBe(0);
    }
    const removed = baselineCommand(
      "remove",
      baseline.id,
      definition.revisionId,
    );
    expect(removed.status, removed.stderr).toBe(0);
    expect(JSON.parse(removed.stdout).baselineMutation.operation).toBe(
      "definition-member-removed",
    );
    const restored = baselineCommand("add", baseline.id, definition.revisionId);
    expect(restored.status, restored.stderr).toBe(0);

    const beforeFreeze = req(repositoryRoot, "show", baseline.revisionId, "--json");
    expect(JSON.parse(beforeFreeze.stdout).lifecycleDatum.datum).toMatchObject({
      type: "SNP",
      payload: {
        definition_members: [definition.revisionId],
        evidence: [evidence.revisionId],
      },
      links: [{ type: "composes", target: component.revisionId }],
    });
    expect(JSON.parse(beforeFreeze.stdout).lifecycleDatum.datum.payload)
      .not.toHaveProperty("snapshot");

    const frozen = baselineCommand("freeze", baseline.id);
    expect(frozen.status, frozen.stderr).toBe(0);
    expect(JSON.parse(frozen.stdout)).toEqual(expect.objectContaining({
      ok: true,
      command: "baseline.freeze",
      baselineFreeze: {
        baselineRevision: baseline.revisionId,
        definitionMembers: [definition.revisionId],
        evidence: [evidence.revisionId],
        composition: [component.revisionId],
        hashes: 3,
        processRef: expect.stringMatching(/^mdlm-bootstrap@0\.58\.0#sha256:/),
        frozenAt: expect.any(String),
      },
    }));

    const shown = req(repositoryRoot, "show", baseline.revisionId, "--json");
    expect(shown.status, shown.stderr).toBe(0);
    const lifecycleDatum = JSON.parse(shown.stdout).lifecycleDatum;
    const snapshot = lifecycleDatum.datum.payload.snapshot;
    expect(lifecycleDatum.storage).toEqual({ editable: false, frozen: true });
    expect(lifecycleDatum.datum.payload).toMatchObject({
      title: "Level baseline",
      kind: "level-candidate",
      role: "candidate",
      scope: "Level baseline",
      group: "DEFAULT",
      definition_members: [definition.revisionId],
      evidence: [evidence.revisionId],
    });
    expect(lifecycleDatum.datum.links).toEqual([
      { type: "composes", target: component.revisionId },
    ]);
    expect(snapshot).toMatchObject({
      member_hashes: {
        [definition.revisionId]: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        [evidence.revisionId]: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        [component.revisionId]: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
      resolved_links: {
        [baseline.revisionId]: [component.revisionId],
        [definition.revisionId]: [product.revisionId],
        [evidence.revisionId]: [],
        [component.revisionId]: [],
      },
      process_provenance: {
        process_ref: expect.stringMatching(/^mdlm-bootstrap@0\.58\.0#sha256:/),
        manifest_hash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        asset_refs: expect.arrayContaining([
          "create-candidate-baseline@1",
          "draft-stakeholder-requirements@2",
          "compile-psp@2",
        ]),
      },
    });
    const definitionBytes = await fs.readFile(
      path.join(repositoryRoot, definition.path),
    );
    expect(snapshot.member_hashes[definition.revisionId]).toBe(
      `sha256:${createHash("sha256").update(definitionBytes).digest("hex")}`,
    );

    const verified = baselineCommand("verify", baseline.revisionId);
    expect(verified.status, verified.stderr).toBe(0);
    expect(JSON.parse(verified.stdout)).toEqual(expect.objectContaining({
      ok: true,
      command: "baseline.verify",
      baselineVerification: {
        baselineRevision: baseline.revisionId,
        valid: true,
        definitionMembers: [definition.revisionId],
        evidence: [evidence.revisionId],
        composition: [component.revisionId],
        checkedHashes: 3,
        checkedResolutions: 4,
      },
    }));
    const humanVerified = req(
      repositoryRoot,
      "baseline",
      "verify",
      baseline.revisionId,
    );
    expect(humanVerified.status, humanVerified.stderr).toBe(0);
    expect(humanVerified.stdout).toContain(
      `Baseline Verification: ${baseline.revisionId} [valid]`,
    );

    const productPath = path.join(repositoryRoot, product.path);
    const productBefore = await fs.readFile(productPath, "utf8");
    await fs.writeFile(productPath, `${productBefore}changed component member\n`);
    const invalidNestedComposition = baselineCommand(
      "verify",
      baseline.revisionId,
    );
    expect(invalidNestedComposition.status).toBe(1);
    expect(JSON.parse(invalidNestedComposition.stdout).diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({
        code: "baseline-composition-invalid",
        path: component.revisionId,
      })]),
    );
    await fs.writeFile(productPath, productBefore);

    const newerStableTarget = req(
      repositoryRoot,
      "revise",
      product.id,
      "--json",
    );
    expect(newerStableTarget.status, newerStableTarget.stderr).toBe(0);
    const historicallyExact = baselineCommand("verify", baseline.revisionId);
    expect(historicallyExact.status, historicallyExact.stderr).toBe(0);

    const frozenBaselineMutation = baselineCommand(
      "remove",
      baseline.id,
      definition.revisionId,
    );
    expect(frozenBaselineMutation.status).toBe(1);
    expect(JSON.parse(frozenBaselineMutation.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "frozen-revision-immutable" }),
    ]);
    const frozenEvidenceMutation = req(
      repositoryRoot,
      "link",
      evidence.revisionId,
      product.id,
      "--type",
      "blocks",
      "--json",
    );
    expect(frozenEvidenceMutation.status).toBe(1);
    expect(JSON.parse(frozenEvidenceMutation.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "frozen-revision-immutable" }),
    ]);
  }, 45_000);

  it("rejects invalid composition atomically and verification detects changed bytes, missing references, and corrupt composition", async () => {
    const product = createProductSpecification();
    const definition = createDefinition(product.id);
    const baseline = createBaseline("Verification baseline");
    expect(baselineCommand("add", baseline.id, definition.revisionId).status).toBe(0);

    const editableComponent = createBaseline("Editable component");
    const baselineBefore = await fs.readFile(
      path.join(repositoryRoot, baseline.path),
      "utf8",
    );
    const invalidComposition = baselineCommand(
      "compose",
      baseline.id,
      editableComponent.revisionId,
    );
    expect(invalidComposition.status).toBe(1);
    expect(JSON.parse(invalidComposition.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "baseline-composition-not-frozen" }),
    ]);
    expect(await fs.readFile(path.join(repositoryRoot, baseline.path), "utf8"))
      .toBe(baselineBefore);

    const doctor = req(repositoryRoot, "doctor", "--json");
    expect(doctor.status, doctor.stderr).toBe(0);
    const indexPath = path.join(
      repositoryRoot,
      ".lifecycle/generated/indexes/data.json",
    );
    const indexBefore = await fs.readFile(indexPath, "utf8");

    const directlyLinked = req(
      repositoryRoot,
      "link",
      baseline.revisionId,
      editableComponent.revisionId,
      "--type",
      "composes",
      "--json",
    );
    expect(directlyLinked.status, directlyLinked.stderr).toBe(0);
    const invalidBeforeFreeze = await fs.readFile(
      path.join(repositoryRoot, baseline.path),
      "utf8",
    );
    const failedFreeze = baselineCommand("freeze", baseline.id);
    expect(failedFreeze.status).toBe(1);
    expect(JSON.parse(failedFreeze.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "baseline-composition-not-frozen" }),
    ]);
    expect(await fs.readFile(path.join(repositoryRoot, baseline.path), "utf8"))
      .toBe(invalidBeforeFreeze);
    expect(await fs.readFile(indexPath, "utf8")).toBe(indexBefore);
    const removedInvalidComposition = req(
      repositoryRoot,
      "unlink",
      baseline.revisionId,
      editableComponent.revisionId,
      "--type",
      "composes",
      "--json",
    );
    expect(removedInvalidComposition.status, removedInvalidComposition.stderr).toBe(0);

    expect(baselineCommand("freeze", baseline.id).status).toBe(0);
    const definitionPath = path.join(repositoryRoot, definition.path);
    const definitionBefore = await fs.readFile(definitionPath, "utf8");
    await fs.writeFile(definitionPath, `${definitionBefore}changed byte\n`);
    const changed = baselineCommand("verify", baseline.revisionId);
    expect(changed.status).toBe(1);
    expect(JSON.parse(changed.stdout).diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({
        code: "baseline-hash-mismatch",
        path: definition.revisionId,
      })]),
    );

    await fs.writeFile(definitionPath, definitionBefore);
    await fs.rm(definitionPath);
    const missing = baselineCommand("verify", baseline.revisionId);
    expect(missing.status).toBe(1);
    expect(JSON.parse(missing.stdout).diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({
        code: "baseline-reference-missing",
        path: definition.revisionId,
      })]),
    );

    await fs.writeFile(definitionPath, definitionBefore);
    const frozenPath = path.join(repositoryRoot, baseline.path);
    const frozenBefore = await fs.readFile(frozenPath, "utf8");
    await fs.writeFile(
      frozenPath,
      frozenBefore.replace(
        "links: []",
        `links:\n  - type: composes\n    target: ${editableComponent.revisionId}`,
      ),
    );
    const corruptComposition = baselineCommand("verify", baseline.revisionId);
    expect(corruptComposition.status).toBe(1);
    expect(JSON.parse(corruptComposition.stdout).diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({
        code: "baseline-composition-not-frozen",
        path: editableComponent.revisionId,
      })]),
    );
  }, 20_000);

  it("does not expose baseline commands without a selected compatible binding", async () => {
    const emptyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-no-baseline-"));
    try {
      const scaffolded = req(emptyRoot, "process", "init", "plain-process", "--json");
      expect(scaffolded.status, scaffolded.stderr).toBe(0);
      const initialized = req(
        emptyRoot,
        "init",
        "--process",
        path.join(emptyRoot, "plain-process"),
        "--json",
      );
      expect(initialized.status, initialized.stderr).toBe(0);
      const unavailable = req(
        emptyRoot,
        "baseline",
        "create",
        "--type",
        "SNP",
        "--json",
      );
      expect(unavailable.status).toBe(1);
      expect(JSON.parse(unavailable.stdout)).toEqual(expect.objectContaining({
        ok: false,
        command: "baseline.create",
        diagnostics: [{
          code: "kernel-capability-unavailable",
          path: "exact-baseline@1",
          message: "Selected Process Package does not bind Kernel Capability exact-baseline@1",
        }],
      }));
    } finally {
      await fs.rm(emptyRoot, { recursive: true, force: true });
    }
  });
});

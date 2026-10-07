import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse, stringify } from "yaml";
import { test, expect } from "vitest";
import { type DatumEnvelope } from "../src/index.js";
import { initializeRepositoryFromProcessPackage } from "../src/repository-initialization.js";
import { installedProcessPackageRoot } from "../src/installed-process-package.js";
import { directState } from "../src/direct-proposal.js";
import { previewProcessUpgrade, applyProcessUpgrade } from "../src/process-upgrade.js";
import { renderLifecycleDatum } from "../src/lifecycle-repository.js";
import { verificationAuthoringContext, validateVerificationActivity } from "../src/independent-verification.js";

// Canonical loader authentication is part of this seam. No helper grants a
// caller-supplied activity or package an authenticated historical context.
test("compatible upgrade retains authenticated methods while new authoring and semantic inputs stay strict", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-method-upgrade-"));
  const repository = path.join(root, "lifecycle"), target = path.join(root, "target");
  const originalRoot = installedProcessPackageRoot("iterative");
  try {
    expect((await initializeRepositoryFromProcessPackage(repository, originalRoot)).ok).toBe(true);
    const before = await directState(repository);
    const publishFixture = async (type: string, actionId: string, id: string, payload: DatumEnvelope["payload"], links: DatumEnvelope["links"] = []) => {
      const action = before.pkg.actions[actionId]!;
      const datum: DatumEnvelope = {id, revision: 1, revision_id: `${id}-r00001`, type, payload, links, body: "", created_by: {transaction: "mdlm-direct-transaction@1", process_ref: `${before.package.reference}#${before.package.digest}`, prompt_ref: action.prompt_ref, loaded_skill_refs: [], policy_refs: []}};
      const txid = `direct-${createHash("sha256").update(id).digest("hex")}`;
      const directory = path.join(repository, ".lifecycle/data/.transactions", txid);
      await fs.mkdir(directory, {recursive: true});
      await fs.writeFile(path.join(directory, `${id}.md`), renderLifecycleDatum(datum));
      await fs.writeFile(path.join(directory, "execution.json"), JSON.stringify({contract: "mdlm-direct-transaction@1", id: txid, operation: id, action: `${action.id}@${action.version}`, package: before.package, proposalDigest: `sha256:${"a".repeat(64)}`, outputs: [datum]}));
      return datum;
    };
    const icd = await publishFixture("ICD", "record-interface", "ICD-ABCDEFGHJKMN", {title: "Count interface", publication: "recorded", boundary: "external", endpoints: [{name: "Counter", owner: "Fixture", responsibility: "Count"}, {name: "Caller", owner: "Fixture", responsibility: "Supply arguments"}], interaction: "Public arguments", failure_behavior: "Exit nonzero", compatibility: "Exact invocation", assumptions: "One process"});
    const exp = await publishFixture("EXP", "frame-experiment", "EXP-ABCDEFGHJKMN", {title: "Count", publication: "recorded", criterion: "Two arguments produce two", question: "Can the public command count?", approach: "Observe public output", constraints: "Local", allowance_minutes: 1, scope_cut: "Count only"}, [{type: "uses-interface", target: icd.revision_id}]);
    const authoring = verificationAuthoringContext({...before, data: [icd, exp]}, exp.revision_id);
    const vfy = await publishFixture("VFY", "plan-criterion-verification", "VFY-ABCDEFGHJKMN", {title: "Count method", publication: "recorded", method: "Public command observation", objective: "Count arguments", authoring_subject: exp.revision_id, authoring_context: authoring.authoringContext, cases: [{id: "count", targets: [exp.revision_id], preconditions: ["Fresh process"], actions: ["Invoke two arguments"], expected_results: ["Two"], coverage_rationale: "Observable count"}], coverage: [{target: exp.revision_id, obligations: ["Correct count"], case_ids: ["count"], rationale: "Public count"}], repository_path: "/independent-verifier", source_commit: "b".repeat(40), verification_image: `sha256:${"c".repeat(64)}`, verification_script: "verify.py", verification_command: ["python3", "verify.py"], results_path: "results.json"}, [{type: "verifies", target: exp.revision_id}, {type: "uses-interface", target: icd.revision_id}]);
    await fs.cp(originalRoot, target, {recursive: true});
    const manifestPath = path.join(target, "manifest.yaml"), manifest = parse(await fs.readFile(manifestPath, "utf8"));
    manifest.version = "2.5.99";
    await fs.writeFile(manifestPath, stringify(manifest));
    await fs.writeFile(path.join(root, "RELEASE-NOTES.md"), "Compatible method-context fixture, fresh target observations required.\n");
    const preview = await previewProcessUpgrade(repository, target);
    await applyProcessUpgrade(repository, JSON.stringify(preview), "method-upgrade");
    const current = await directState(repository), activity = current.data.find(d => d.revision_id === vfy.revision_id)!;
    expect(activity).toEqual(vfy);
    expect(() => validateVerificationActivity(current, activity)).not.toThrow();
    expect(() => validateVerificationActivity({...current, authoringSelections: []}, activity)).toThrow("authenticated");
    // A new/revised proposal output, even with copied fields, has no loader evidence.
    expect(() => validateVerificationActivity(current, structuredClone(activity))).toThrow("authenticated");
    const originalMethod = activity.payload.method;
    activity.payload.method = "Changed method after authentication";
    expect(() => validateVerificationActivity(current, activity)).toThrow("authenticated");
    activity.payload.method = originalMethod;
    const newActivity = structuredClone(activity);
    newActivity.payload.authoring_context = verificationAuthoringContext(current, exp.revision_id).authoringContext;
    expect(() => validateVerificationActivity(current, newActivity)).not.toThrow();
    for (const changed of [exp.revision_id, icd.revision_id]) {
      const data = current.data.map(d => d.revision_id === changed ? {...d, body: "Changed normative meaning"} : d);
      expect(() => validateVerificationActivity({...current, data}, activity)).toThrow("semantic inputs");
    }
    const changedBindings = {...current.pkg, kernelCapabilities: {...current.pkg.kernelCapabilities, "independent-verification@1": {...current.pkg.kernelCapabilities["independent-verification@1"]!, requirement_type: "ICD"}}};
    expect(() => validateVerificationActivity({...current, pkg: changedBindings}, activity)).toThrow("authenticated");
    const txid = `direct-${createHash("sha256").update(vfy.id).digest("hex")}`;
    const txPath = path.join(repository, ".lifecycle/data/.transactions", txid, "execution.json");
    const txBytes = await fs.readFile(txPath);
    await fs.writeFile(txPath, "{}");
    await expect(directState(repository)).rejects.toThrow("provenance");
    await fs.writeFile(txPath, txBytes);
    const activityPath = path.join(repository, ".lifecycle/data/.transactions", txid, `${vfy.id}.md`), originalBytes = await fs.readFile(activityPath);
    const forged = {...vfy, payload: {...vfy.payload, authoring_context: `sha256:${"d".repeat(64)}`}};
    await fs.writeFile(activityPath, renderLifecycleDatum(forged));
    await expect(directState(repository)).rejects.toThrow("provenance");
    await fs.writeFile(activityPath, originalBytes);
    const oldPackage = path.join(repository, ".lifecycle/packages", before.package.reference), oldManifest = path.join(oldPackage, "manifest.yaml"), packageBytes = await fs.readFile(oldManifest);
    await fs.appendFile(oldManifest, "\n# forged retained package\n");
    await expect(directState(repository)).rejects.toThrow("provenance");
    await fs.writeFile(oldManifest, packageBytes);
    await fs.rename(oldPackage, `${oldPackage}-unavailable`);
    await expect(directState(repository)).rejects.toThrow();
  } finally {
    await fs.rm(root, {recursive: true, force: true});
  }
});

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { stringify } from "yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { req } from "./helpers/req.js";

const bootstrapPackage = path.join(process.cwd(), ".lifecycle/process");

describe("req source-owned links", () => {
  let repositoryRoot: string;

  beforeEach(async () => {
    repositoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-link-repo-"));
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

  function createPsp(title = "Trace target") {
    return req(
      repositoryRoot,
      "new",
      "PSP",
      "--scenario",
      "compile-psp@1",
      "--set",
      `title=${title}`,
      "--set",
      "rationale=Traceability must remain source owned",
      "--set",
      "problem=Inverse links can duplicate durable truth",
      "--set",
      'users=["lifecycle author"]',
      "--set",
      'goals=["compute backlinks"]',
      "--set",
      "non_goals=[]",
      "--set",
      'success_measures=["one outbound link produces one backlink"]',
      "--json",
    );
  }

  function createQuestion() {
    return req(
      repositoryRoot,
      "new",
      "QST",
      "--scenario",
      "compile-psp@1",
      "--set",
      "title=Traceability question",
      "--set",
      "kind=preferential",
      "--set",
      "question=Which intent is blocked?",
      "--set",
      "state=open",
      "--set",
      "blocking_impact=The product intent cannot be completed",
      "--json",
    );
  }

  function createDecision() {
    return req(
      repositoryRoot,
      "new",
      "DEC",
      "--scenario",
      "compile-psp@1",
      "--set",
      "title=Link decision",
      "--set",
      "rationale=Invalid target kinds must be rejected",
      "--set",
      "kind=decision",
      "--set",
      "decision=Retain exact link semantics",
      "--set",
      'alternatives=["Store inverse links"]',
      "--set",
      "effective_scope=repository graph",
      "--json",
    );
  }

  function createStakeholderRequirement(productSpecificationId: string) {
    return req(
      repositoryRoot,
      "new",
      "STK",
      "--scenario",
      "draft-stakeholder-requirements@1",
      "--set",
      "title=Source-owned graph",
      "--set",
      "rationale=Every edge must satisfy its source contract",
      "--set",
      "statement=The repository shall validate outbound links.",
      "--set",
      "verification_intent=Attempt invalid mutations.",
      "--set",
      "stakeholder=lifecycle author",
      "--set",
      "priority=must",
      "--link",
      `derived-from=${productSpecificationId}`,
      "--json",
    );
  }

  async function freezeRevision(revisionId: string): Promise<void> {
    const baselineId = "BSL-9876543210";
    const directory = path.join(repositoryRoot, ".lifecycle/data/BSL", baselineId);
    await fs.mkdir(directory, { recursive: true });
    const frontmatter = stringify({
      id: baselineId,
      revision: 1,
      revision_id: `${baselineId}-r00001`,
      type: "BSL",
      payload: {
        title: "Frozen link source",
        kind: "review-context",
        role: "review-context",
        scope: "link immutability test",
        group: "DEFAULT",
        definition_members: [revisionId],
        evidence: [],
        snapshot: {
          frozen_at: "2026-08-04T18:00:00.000Z",
          member_hashes: { [revisionId]: `sha256:${"0".repeat(64)}` },
          resolved_links: {},
          process_provenance: {
            process_ref: "mdlm-bootstrap@0.24.0",
            manifest_hash: `sha256:${"1".repeat(64)}`,
            asset_refs: [],
          },
        },
      },
      links: [],
      created_by: {
        scenario: "create-review-context@1",
        prompt_ref: "prompts/create-review-context.md@1",
        process_ref: "mdlm-bootstrap@0.24.0",
        loaded_skill_refs: [],
        policy_refs: [],
      },
    }).trimEnd();
    await fs.writeFile(path.join(directory, "r00001.md"), `---\n${frontmatter}\n---\n`);
  }

  async function markdownBytes(): Promise<Map<string, string>> {
    const dataRoot = path.join(repositoryRoot, ".lifecycle/data");
    const result = new Map<string, string>();
    async function visit(directory: string): Promise<void> {
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        const current = path.join(directory, entry.name);
        if (entry.isDirectory()) await visit(current);
        else if (entry.name.endsWith(".md")) {
          result.set(path.relative(dataRoot, current), await fs.readFile(current, "utf8"));
        }
      }
    }
    await visit(dataRoot);
    return result;
  }

  it("stores one outbound link and computes identity-preserving backlinks and traces", () => {
    const targetResult = createPsp();
    const sourceResult = createQuestion();
    expect(targetResult.status, targetResult.stderr).toBe(0);
    expect(sourceResult.status, sourceResult.stderr).toBe(0);
    const target = JSON.parse(targetResult.stdout).created;
    const source = JSON.parse(sourceResult.stdout).created;

    const linked = req(
      repositoryRoot,
      "link",
      source.revisionId,
      target.id,
      "--type",
      "blocks",
      "--json",
    );
    expect(linked.status, linked.stderr).toBe(0);
    expect(JSON.parse(linked.stdout)).toEqual(expect.objectContaining({
      ok: true,
      command: "link",
      linkMutation: {
        operation: "added",
        sourceRevision: source.revisionId,
        type: "blocks",
        target: target.id,
      },
    }));

    const shownSource = req(repositoryRoot, "show", source.revisionId, "--json");
    expect(shownSource.status, shownSource.stderr).toBe(0);
    expect(JSON.parse(shownSource.stdout).lifecycleDatum.datum.links).toEqual([
      { type: "blocks", target: target.id },
    ]);

    const backlinks = req(repositoryRoot, "backlinks", target.id, "--json");
    expect(backlinks.status, backlinks.stderr).toBe(0);
    expect(JSON.parse(backlinks.stdout)).toEqual(expect.objectContaining({
      ok: true,
      command: "backlinks",
      backlinks: {
        identity: target.id,
        identityKind: "stable-datum",
        type: "PSP",
        links: [{
          source: source.revisionId,
          sourceIdentityKind: "revision",
          sourceType: "QST",
          type: "blocks",
          target: target.id,
          targetIdentityKind: "stable-datum",
          inverseLabel: "blocked-by",
        }],
      },
    }));

    const shownTarget = req(repositoryRoot, "show", target.revisionId, "--json");
    expect(shownTarget.status, shownTarget.stderr).toBe(0);
    expect(JSON.parse(shownTarget.stdout).lifecycleDatum.datum.links).toEqual([]);

    const humanBacklinks = req(repositoryRoot, "backlinks", target.id);
    expect(humanBacklinks.status, humanBacklinks.stderr).toBe(0);
    expect(humanBacklinks.stdout).toContain(
      `${source.revisionId} --blocks/blocked-by--> ${target.id} [stable datum]`,
    );

    const traced = req(
      repositoryRoot,
      "trace",
      target.id,
      "--relation",
      "blocks",
      "--depth",
      "1",
      "--json",
    );
    expect(traced.status, traced.stderr).toBe(0);
    expect(JSON.parse(traced.stdout)).toEqual(expect.objectContaining({
      ok: true,
      command: "trace",
      trace: {
        root: {
          identity: target.id,
          identityKind: "stable-datum",
          type: "PSP",
        },
        depth: 1,
        relation: "blocks",
        nodes: expect.arrayContaining([
          {
            identity: target.id,
            identityKind: "stable-datum",
            type: "PSP",
          },
          {
            identity: source.revisionId,
            identityKind: "revision",
            type: "QST",
          },
        ]),
        links: [{
          source: source.revisionId,
          sourceIdentityKind: "revision",
          sourceType: "QST",
          type: "blocks",
          target: target.id,
          targetIdentityKind: "stable-datum",
          inverseLabel: "blocked-by",
        }],
      },
    }));

    const tracedFromStableSource = req(
      repositoryRoot,
      "trace",
      source.id,
      "--relation",
      "blocks",
      "--depth",
      "1",
      "--json",
    );
    expect(tracedFromStableSource.status, tracedFromStableSource.stderr).toBe(0);
    expect(JSON.parse(tracedFromStableSource.stdout).trace).toEqual({
      root: {
        identity: source.id,
        identityKind: "stable-datum",
        type: "QST",
      },
      depth: 1,
      relation: "blocks",
      nodes: expect.arrayContaining([
        {
          identity: source.id,
          identityKind: "stable-datum",
          type: "QST",
        },
        {
          identity: source.revisionId,
          identityKind: "revision",
          type: "QST",
        },
        {
          identity: target.id,
          identityKind: "stable-datum",
          type: "PSP",
        },
      ]),
      links: [expect.objectContaining({
        source: source.revisionId,
        sourceIdentityKind: "revision",
        target: target.id,
        targetIdentityKind: "stable-datum",
      })],
    });

    const unlinked = req(
      repositoryRoot,
      "unlink",
      source.revisionId,
      target.id,
      "--type",
      "blocks",
      "--json",
    );
    expect(unlinked.status, unlinked.stderr).toBe(0);
    expect(JSON.parse(unlinked.stdout).linkMutation).toEqual({
      operation: "removed",
      sourceRevision: source.revisionId,
      type: "blocks",
      target: target.id,
    });
    const emptyBacklinks = req(repositoryRoot, "backlinks", target.id, "--json");
    expect(JSON.parse(emptyBacklinks.stdout).backlinks.links).toEqual([]);
  });

  it("rejects invalid source contracts, targets, cardinalities, and frozen mutations atomically", async () => {
    const firstTargetResult = createPsp("First target");
    const secondTargetResult = createPsp("Second target");
    const questionResult = createQuestion();
    const decisionResult = createDecision();
    for (const result of [
      firstTargetResult,
      secondTargetResult,
      questionResult,
      decisionResult,
    ]) expect(result.status, result.stderr).toBe(0);
    const firstTarget = JSON.parse(firstTargetResult.stdout).created;
    const secondTarget = JSON.parse(secondTargetResult.stdout).created;
    const question = JSON.parse(questionResult.stdout).created;
    const decision = JSON.parse(decisionResult.stdout).created;
    const requirementResult = createStakeholderRequirement(firstTarget.id);
    expect(requirementResult.status, requirementResult.stderr).toBe(0);
    const requirement = JSON.parse(requirementResult.stdout).created;

    const cases: { arguments: string[]; code: string }[] = [
      {
        arguments: ["link", firstTarget.revisionId, question.id, "--type", "blocks"],
        code: "unknown-outgoing-link",
      },
      {
        arguments: ["link", question.revisionId, "not-an-identity", "--type", "blocks"],
        code: "invalid-link-target-identity",
      },
      {
        arguments: ["link", question.revisionId, "PSP-0123456789", "--type", "blocks"],
        code: "unknown-link-target",
      },
      {
        arguments: ["link", question.revisionId, firstTarget.revisionId, "--type", "blocks"],
        code: "incompatible-link-target",
      },
      {
        arguments: ["link", decision.revisionId, firstTarget.revisionId, "--type", "resolves"],
        code: "incompatible-link-target",
      },
      {
        arguments: ["link", decision.revisionId, firstTarget.revisionId, "--type", "waives"],
        code: "incompatible-link-target",
      },
      {
        arguments: ["link", requirement.revisionId, secondTarget.id, "--type", "derived-from"],
        code: "link-cardinality",
      },
      {
        arguments: ["unlink", requirement.revisionId, firstTarget.id, "--type", "derived-from"],
        code: "link-cardinality",
      },
    ];

    const doctor = req(repositoryRoot, "doctor", "--json");
    expect(doctor.status, doctor.stderr).toBe(0);
    const indexPath = path.join(repositoryRoot, ".lifecycle/generated/indexes/data.json");
    const indexBefore = await fs.readFile(indexPath, "utf8");
    const dataBefore = await markdownBytes();
    for (const testCase of cases) {
      const failed = req(repositoryRoot, ...testCase.arguments, "--json");
      expect(failed.status, failed.stderr).toBe(1);
      expect(JSON.parse(failed.stdout).diagnostics).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: testCase.code })]),
      );
      expect(await markdownBytes()).toEqual(dataBefore);
      expect(await fs.readFile(indexPath, "utf8")).toBe(indexBefore);
    }

    await freezeRevision(question.revisionId);
    const frozenBefore = await markdownBytes();
    const frozen = req(
      repositoryRoot,
      "link",
      question.revisionId,
      firstTarget.id,
      "--type",
      "blocks",
      "--json",
    );
    expect(frozen.status).toBe(1);
    expect(JSON.parse(frozen.stdout).diagnostics).toEqual([
      expect.objectContaining({
        code: "frozen-revision-immutable",
        path: question.revisionId,
      }),
    ]);
    expect(await markdownBytes()).toEqual(frozenBefore);
    expect(await fs.readFile(indexPath, "utf8")).toBe(indexBefore);
  }, 15_000);
});

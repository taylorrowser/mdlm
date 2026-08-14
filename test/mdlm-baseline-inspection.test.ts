import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { stringify } from "yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadProcessPackage, type DatumEnvelope, type ProcessPackage } from "../src/index.js";
import { finalizeExactBaselineScenarioOutput } from "../src/exact-baseline-repository.js";
import { mdlm } from "./helpers/mdlm.js";

type WrittenDatum = { datum: DatumEnvelope; path: string };
type BaselineFixture = {
  before: WrittenDatum;
  after: WrittenDatum;
  firstMap: WrittenDatum;
  secondMap: WrittenDatum;
  oldEvidence: WrittenDatum;
  newEvidence: WrittenDatum;
};

function expectSuccess(result: ReturnType<typeof mdlm>, command: string): void {
  expect(result.status, `${command}\n${result.stderr}${result.stdout}`).toBe(0);
}

async function writeDatum(repository: string, datum: DatumEnvelope): Promise<WrittenDatum> {
  const revision = `r${String(datum.revision).padStart(5, "0")}`;
  const relativePath = `.lifecycle/data/${datum.type}/${datum.id}/${revision}.md`;
  const filePath = path.join(repository, relativePath);
  const { body, ...frontmatter } = datum;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(
    filePath,
    `---\n${stringify(frontmatter).trimEnd()}\n---\n${body}`,
  );
  return { datum, path: relativePath };
}

function authoring(processRef: string, scenario: string, promptRef: string) {
  return {
    scenario,
    prompt_ref: promptRef,
    process_ref: processRef,
    loaded_skill_refs: [],
    policy_refs: [],
  };
}

function question(
  processRef: string,
  id: string,
  title: string,
): DatumEnvelope {
  return {
    id,
    revision: 1,
    revision_id: `${id}-r00001`,
    type: "QST",
    payload: {
      title,
      kind: "empirical",
      question: "Does the exact evidence still support the inspected baseline?",
      state: "answered",
      blocking_impact: "Changed evidence requires explicit reassessment.",
    },
    links: [],
    created_by: authoring(
      processRef,
      "establish-initial-wayfinding-map@1",
      "prompts/establish-initial-wayfinding-map.md@1",
    ),
    body: `${title} body.\n`,
  };
}

function mapRevision(
  processRef: string,
  revision: number,
  evidenceId: string,
): DatumEnvelope {
  const id = "MAP-1040000001";
  return {
    id,
    revision,
    revision_id: `${id}-r${String(revision).padStart(5, "0")}`,
    type: "MAP",
    payload: {
      title: revision === 1 ? "Before baseline member" : "After baseline member",
      purpose: revision === 1
        ? "Capture the original exact member."
        : "Capture substantive changed member content.",
      frontier: [revision === 1 ? "Original evidence" : "Replacement evidence"],
    },
    links: [{ type: "indexes", target: evidenceId }],
    created_by: authoring(
      processRef,
      "establish-initial-wayfinding-map@1",
      "prompts/establish-initial-wayfinding-map.md@1",
    ),
    body: revision === 1 ? "Before member body.\n" : "After member body.\n",
  };
}

async function freezeBaseline(
  repository: string,
  processPackage: ProcessPackage,
  processRef: string,
  datum: DatumEnvelope,
): Promise<WrittenDatum> {
  const finalized = await finalizeExactBaselineScenarioOutput(
    repository,
    processPackage,
    processRef,
    datum,
  );
  if (!finalized.ok) throw new Error(JSON.stringify(finalized.diagnostics));
  return writeDatum(repository, finalized.value.output.datum);
}

async function selectedPackage(repository: string): Promise<{
  processPackage: ProcessPackage;
  processRef: string;
}> {
  const descriptor = JSON.parse(await fs.readFile(
    path.join(repository, ".lifecycle/repository.json"),
    "utf8",
  )) as { package: { reference: string; digest: string } };
  const loaded = await loadProcessPackage(path.join(
    repository,
    ".lifecycle/packages",
    descriptor.package.reference,
  ));
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
  return {
    processPackage: loaded.package,
    processRef: `${descriptor.package.reference}#${descriptor.package.digest}`,
  };
}

async function arrangeChangedBaselines(repository: string): Promise<BaselineFixture> {
  const { processPackage, processRef } = await selectedPackage(repository);
  const oldEvidence = await writeDatum(
    repository,
    question(processRef, "QST-1040000001", "Original evidence"),
  );
  const firstMap = await writeDatum(
    repository,
    mapRevision(processRef, 1, oldEvidence.datum.id),
  );
  const beforeId = "BSL-1040000001";
  const before = await freezeBaseline(repository, processPackage, processRef, {
    id: beforeId,
    revision: 1,
    revision_id: `${beforeId}-r00001`,
    type: "BSL",
    payload: {
      title: "Before exact baseline",
      kind: "level-candidate",
      role: "candidate",
      scope: "reader coverage",
      group: "inspection",
      definition_members: [firstMap.datum.revision_id],
      evidence: [oldEvidence.datum.revision_id],
    },
    links: [],
    created_by: authoring(
      processRef,
      "create-candidate-baseline@1",
      "prompts/create-candidate-baseline.md@1",
    ),
    body: "The original exact baseline.\n",
  });

  const newEvidence = await writeDatum(
    repository,
    question(processRef, "QST-1040000002", "Replacement evidence"),
  );
  const secondMap = await writeDatum(
    repository,
    mapRevision(processRef, 2, newEvidence.datum.id),
  );
  const afterId = "BSL-1040000002";
  const after = await freezeBaseline(repository, processPackage, processRef, {
    id: afterId,
    revision: 1,
    revision_id: `${afterId}-r00001`,
    type: "BSL",
    payload: {
      title: "After exact baseline",
      kind: "level-candidate",
      role: "candidate",
      scope: "reader coverage",
      group: "inspection",
      definition_members: [secondMap.datum.revision_id],
      evidence: [newEvidence.datum.revision_id],
    },
    links: [{ type: "supersedes", target: before.datum.revision_id }],
    created_by: authoring(
      processRef,
      "create-candidate-baseline@1",
      "prompts/create-candidate-baseline.md@1",
    ),
    body: "The replacement exact baseline.\n",
  });
  return { before, after, firstMap, secondMap, oldEvidence, newEvidence };
}

describe("compiled mdlm baseline inspection", () => {
  let parent: string;
  let repository: string;

  beforeEach(async () => {
    parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-baseline-inspection-"));
    repository = path.join(parent, "repository");
    const initialized = mdlm(parent, "init", repository, "--json");
    expectSuccess(initialized, "mdlm init");
  });

  afterEach(async () => {
    await fs.rm(parent, { recursive: true, force: true });
  });

  it("verifies exact members and evidence and reports substantive baseline differences", async () => {
    const fixture = await arrangeChangedBaselines(repository);

    for (const baseline of [fixture.before, fixture.after]) {
      const verified = mdlm(
        repository,
        "baseline",
        "verify",
        baseline.datum.revision_id,
        "--json",
      );
      expectSuccess(verified, `mdlm baseline verify ${baseline.datum.revision_id}`);
      expect(JSON.parse(verified.stdout).baselineVerification).toEqual({
        baselineRevision: baseline.datum.revision_id,
        valid: true,
        definitionMembers: [
          baseline === fixture.before
            ? fixture.firstMap.datum.revision_id
            : fixture.secondMap.datum.revision_id,
        ],
        evidence: [
          baseline === fixture.before
            ? fixture.oldEvidence.datum.revision_id
            : fixture.newEvidence.datum.revision_id,
        ],
        composition: [],
        checkedHashes: 2,
        checkedResolutions: 3,
      });
    }

    const compared = mdlm(
      repository,
      "baseline",
      "diff",
      fixture.before.datum.revision_id,
      fixture.after.datum.revision_id,
      "--json",
    );
    expectSuccess(compared, "mdlm baseline diff");
    const diff = JSON.parse(compared.stdout).baselineDiff;
    expect(diff).toMatchObject({
      beforeBaseline: fixture.before.datum.revision_id,
      afterBaseline: fixture.after.datum.revision_id,
      processDrift: [],
    });
    expect(diff.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        record_version: "dependency-change@1",
        kind: "content-change",
        subject_revision: fixture.secondMap.datum.revision_id,
        path: "payload.title",
        before: "Before baseline member",
        after: "After baseline member",
      }),
      expect.objectContaining({
        kind: "outbound-link-change",
        subject_revision: fixture.secondMap.datum.revision_id,
        link_type: "indexes",
        before_targets: [fixture.oldEvidence.datum.id],
        after_targets: [fixture.newEvidence.datum.id],
      }),
      expect.objectContaining({
        kind: "baseline-membership-change",
        subject_revision: fixture.after.datum.revision_id,
        removed_members: [fixture.firstMap.datum.revision_id],
        added_members: [fixture.secondMap.datum.revision_id],
      }),
      expect.objectContaining({
        kind: "evidence-target-change",
        subject_revision: fixture.after.datum.revision_id,
        removed_evidence: [fixture.oldEvidence.datum.revision_id],
        added_evidence: [fixture.newEvidence.datum.revision_id],
      }),
      expect.objectContaining({
        kind: "outbound-link-change",
        subject_revision: fixture.after.datum.revision_id,
        link_type: "supersedes",
        before_targets: [],
        after_targets: [fixture.before.datum.revision_id],
      }),
    ]));
    expect(diff.subjects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        subjectRevision: fixture.after.datum.revision_id,
        changes: expect.arrayContaining([
          expect.objectContaining({ kind: "baseline-membership-change" }),
          expect.objectContaining({ kind: "evidence-target-change" }),
        ]),
      }),
      expect.objectContaining({
        subjectRevision: fixture.secondMap.datum.revision_id,
        changes: expect.arrayContaining([
          expect.objectContaining({ kind: "content-change" }),
        ]),
      }),
    ]));
  });

  it("detects changed bytes, missing exact members, and corrupt frozen resolutions", async () => {
    const fixture = await arrangeChangedBaselines(repository);
    const memberPath = path.join(repository, fixture.firstMap.path);
    const memberBytes = await fs.readFile(memberPath, "utf8");

    await fs.writeFile(memberPath, `${memberBytes}changed frozen byte\n`);
    const hashFailure = mdlm(
      repository,
      "baseline",
      "verify",
      fixture.before.datum.revision_id,
      "--json",
    );
    expect(hashFailure.status).toBe(1);
    expect(JSON.parse(hashFailure.stdout).diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({
        code: "baseline-hash-mismatch",
        path: fixture.firstMap.datum.revision_id,
      })]),
    );
    await fs.writeFile(memberPath, memberBytes);

    const corruptResolution = structuredClone(fixture.before.datum);
    const resolutionSnapshot = corruptResolution.payload.snapshot as {
      resolved_links: Record<string, string[]>;
    };
    resolutionSnapshot.resolved_links[fixture.firstMap.datum.revision_id] = [];
    await writeDatum(repository, corruptResolution);
    const resolutionFailure = mdlm(
      repository,
      "baseline",
      "verify",
      fixture.before.datum.revision_id,
      "--json",
    );
    expect(resolutionFailure.status).toBe(1);
    expect(JSON.parse(resolutionFailure.stdout).diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({
        code: "baseline-resolution-mismatch",
        path: fixture.before.datum.revision_id,
      })]),
    );

    const missingResolution = structuredClone(fixture.before.datum);
    const missingSnapshot = missingResolution.payload.snapshot as {
      resolved_links: Record<string, string[]>;
    };
    missingSnapshot.resolved_links[fixture.firstMap.datum.revision_id] = [
      `${fixture.oldEvidence.datum.id}-r00002`,
    ];
    await writeDatum(repository, missingResolution);
    const missingTarget = mdlm(
      repository,
      "baseline",
      "verify",
      fixture.before.datum.revision_id,
      "--json",
    );
    expect(missingTarget.status).toBe(1);
    expect(JSON.parse(missingTarget.stdout).diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({
        code: "baseline-reference-missing",
        path: `${fixture.oldEvidence.datum.id}-r00002`,
      })]),
    );

    await writeDatum(repository, fixture.before.datum);
    await fs.rm(memberPath);
    const missingMember = mdlm(
      repository,
      "baseline",
      "verify",
      fixture.before.datum.revision_id,
      "--json",
    );
    expect(missingMember.status).toBe(1);
    expect(JSON.parse(missingMember.stdout).diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({
        code: "baseline-reference-missing",
        path: fixture.firstMap.datum.revision_id,
      })]),
    );
  });

  it("verifies every repository baseline before rebuilding disposable projections", async () => {
    const fixture = await arrangeChangedBaselines(repository);
    const initial = mdlm(repository, "doctor", "--json");
    expectSuccess(initial, "mdlm doctor");
    expect(JSON.parse(initial.stdout)).toMatchObject({
      baselineRepositoryVerification: { verifiedBaselines: 2, processDrift: 0 },
      index: {
        rebuilt: true,
        data: 6,
        path: ".lifecycle/generated/indexes/data.json",
      },
      report: {
        rebuilt: true,
        data: 5,
        path: ".lifecycle/generated/reports/lifecycle.json",
      },
    });

    await fs.rm(path.join(repository, ".lifecycle/generated"), {
      recursive: true,
      force: true,
    });
    const rebuilt = mdlm(repository, "doctor", "--json");
    expectSuccess(rebuilt, "mdlm doctor rebuild");
    expect(JSON.parse(rebuilt.stdout)).toMatchObject({
      baselineRepositoryVerification: { verifiedBaselines: 2, processDrift: 0 },
      index: { rebuilt: true, data: 6 },
      report: { rebuilt: true, data: 5 },
    });

    const indexPath = path.join(
      repository,
      ".lifecycle/generated/indexes/data.json",
    );
    const reportPath = path.join(
      repository,
      ".lifecycle/generated/reports/lifecycle.json",
    );
    const generated = {
      index: await fs.readFile(indexPath, "utf8"),
      report: await fs.readFile(reportPath, "utf8"),
    };
    const memberPath = path.join(repository, fixture.firstMap.path);
    const memberBytes = await fs.readFile(memberPath, "utf8");
    await fs.writeFile(memberPath, `${memberBytes}repository corruption\n`);

    const unhealthy = mdlm(repository, "doctor", "--json");
    expect(unhealthy.status).toBe(1);
    expect(JSON.parse(unhealthy.stdout).diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({
        code: "baseline-hash-mismatch",
        path: fixture.firstMap.datum.revision_id,
      })]),
    );
    expect(await fs.readFile(indexPath, "utf8")).toBe(generated.index);
    expect(await fs.readFile(reportPath, "utf8")).toBe(generated.report);
  });
});

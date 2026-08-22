import { constants as fsConstants, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { stringify } from "yaml";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  loadProcessPackage,
  type DatumEnvelope,
  type ProcessPackage,
} from "../src/index.js";
import { finalizeExactBaselineScenarioOutput } from "../src/exact-baseline-repository.js";
import {
  datumHistory,
  inspectBacklinks,
  listData,
  readRepositoryData,
  showDatum,
  traceGraph,
} from "../src/lifecycle-repository.js";
import { loadRepositoryInspection } from "../src/repository-inspection.js";
import { executeCommandApplication } from "../src/command-application.js";

async function mdlm(repository: string, ...arguments_: string[]) {
  const execution = await executeCommandApplication(arguments_, repository);
  return { status: execution.exitCode, stdout: execution.output, stderr: "" };
}

async function mdlmWithInput(
  repository: string,
  input: string,
  ...arguments_: string[]
) {
  const execution = await executeCommandApplication(arguments_, repository, input);
  return { status: execution.exitCode, stdout: execution.output, stderr: "" };
}

type PublishedOutput = {
  name: string;
  lifecycleDatum: {
    id: string;
    revisionId: string;
    type: string;
    path: string;
  };
  data: DatumEnvelope;
};

function expectSuccess(
  result: { status: number; stdout: string; stderr: string },
  command: string,
): void {
  expect(result.status, `${command}\n${result.stderr}${result.stdout}`).toBe(0);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

async function writeDatum(repository: string, datum: DatumEnvelope): Promise<string> {
  const revision = `r${String(datum.revision).padStart(5, "0")}`;
  const relativePath = `.lifecycle/data/${datum.type}/${datum.id}/${revision}.md`;
  const filePath = path.join(repository, relativePath);
  const { body, ...frontmatter } = datum;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(
    filePath,
    `---\n${stringify(frontmatter).trimEnd()}\n---\n${body}`,
  );
  return relativePath;
}

async function publishLinkedWayfinding(repository: string): Promise<{
  map: PublishedOutput;
  question: PublishedOutput;
}> {
  const next = await mdlm(repository, "next");
  expectSuccess(next, "mdlm next");
  const assignment = JSON.parse(next.stdout).assignment.id as string;
  const prepared = await mdlm(repository, "scenario", "prepare", assignment);
  expectSuccess(prepared, "mdlm scenario prepare");
  const packet = JSON.parse(prepared.stdout);
  const submitted = await mdlmWithInput(
    repository,
    `${JSON.stringify({
      contract: "mdlm-assignment-response@1",
      assignment,
      kind: "proposal",
      proposal: {
        outputs: [{
          localId: "map",
          name: "map",
          invocation: 0,
          lifecycleDatum: {
            type: "MAP",
            payload: {
              title: "Linked reader graph",
              purpose: "Exercise retained repository inspection through public MDLM commands.",
              frontier: ["$proposal.question.revision_id"],
            },
            links: [{ type: "indexes", target: "$proposal.question.id" }],
            body: "The first exact graph revision.\n",
          },
        }, {
          localId: "question",
          name: "product_intent",
          invocation: 0,
          lifecycleDatum: {
            type: "QST",
            payload: {
              title: "Reader graph question",
              kind: "preferential",
              intent_scope: "product",
              question: "Can every retained graph reader recover this edge?",
              state: "open",
              blocking_impact: "Reader coverage would otherwise be declarative only.",
            },
            links: [],
            body: "The linked question.\n",
          },
        }],
        completionEvidence: { summary: "Published one linked reader graph." },
        loadedSkillRefs: packet.prompt.skills.map(
          (skill: { reference: string }) => skill.reference,
        ),
        authoritySupplies: [],
        standingDelegations: [],
      },
    })}\n`,
    "scenario",
    "submit",
  );
  expectSuccess(submitted, "mdlm scenario submit");
  const outputs = JSON.parse(submitted.stdout).execution.outputs as PublishedOutput[];
  return {
    map: outputs.find((output) => output.name === "map")!,
    question: outputs.find((output) => output.name === "product_intent")!,
  };
}

async function freezeFirstRevisions(
  repository: string,
  processPackage: ProcessPackage,
  processRef: string,
  map: PublishedOutput,
  question: PublishedOutput,
): Promise<DatumEnvelope> {
  const baselineId = "BSL-1040000001";
  const finalized = await finalizeExactBaselineScenarioOutput(
    repository,
    processPackage,
    processRef,
    {
      id: baselineId,
      revision: 1,
      revision_id: `${baselineId}-r00001`,
      type: "BSL",
      payload: {
        title: "Repository reader history",
        kind: "review-context",
        role: "review-context",
        scope: map.lifecycleDatum.revisionId,
        group: "reader-coverage",
        definition_members: [map.lifecycleDatum.revisionId],
        evidence: [question.lifecycleDatum.revisionId],
      },
      links: [],
      created_by: {
        scenario: "create-review-context@1",
        prompt_ref: "prompts/create-review-context.md@2",
        process_ref: processRef,
        loaded_skill_refs: [],
        policy_refs: [],
      },
      body: "Freeze the first graph revisions for history inspection.\n",
    },
  );
  if (!finalized.ok) throw new Error(JSON.stringify(finalized.diagnostics));
  await writeDatum(repository, finalized.value.output.datum);
  return finalized.value.output.datum;
}

async function arrangeReaderRepository(
  repository: string,
  processPackage: ProcessPackage,
  processRef: string,
  existing?: Awaited<ReturnType<typeof publishLinkedWayfinding>>,
) {
  const published = existing ?? await publishLinkedWayfinding(repository);
  const baseline = await freezeFirstRevisions(
    repository,
    processPackage,
    processRef,
    published.map,
    published.question,
  );
  const secondMap: DatumEnvelope = {
    ...structuredClone(published.map.data),
    revision: 2,
    revision_id: `${published.map.lifecycleDatum.id}-r00002`,
    payload: {
      ...structuredClone(published.map.data.payload),
      title: "Linked reader graph, revised",
      purpose: "Prove stable lookup selects the newest exact Revision.",
    },
    body: "The second exact graph revision.\n",
  };
  await writeDatum(repository, secondMap);
  return { ...published, baseline, secondMap };
}

describe("MDLM repository inspection", () => {
  let templateParent: string;
  let templateRepository: string;
  let publishedTemplateRepository: string;
  let processPackage: ProcessPackage;
  let processRef: string;
  let templateFixture: Promise<{
    published: Awaited<ReturnType<typeof publishLinkedWayfinding>>;
    arranged: Awaited<ReturnType<typeof arrangeReaderRepository>>;
  }>;
  let parent: string;
  let repository: string;

  beforeAll(async () => {
    templateParent = await fs.mkdtemp(path.join(
      os.tmpdir(),
      "mdlm-reader-inspection-template-",
    ));
    templateRepository = path.join(templateParent, "repository");
    const initialized = await mdlm(
      templateParent,
      "init",
      templateRepository,
      "--json",
    );
    expectSuccess(initialized, "mdlm init template");
    const descriptor = JSON.parse(await fs.readFile(
      path.join(templateRepository, ".lifecycle/repository.json"),
      "utf8",
    )) as { package: { reference: string; digest: string } };
    const loaded = await loadProcessPackage(path.join(
      templateRepository,
      ".lifecycle/packages",
      descriptor.package.reference,
    ));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
    processPackage = deepFreeze(loaded.package);
    processRef = `${descriptor.package.reference}#${descriptor.package.digest}`;
    publishedTemplateRepository = path.join(templateParent, "published-repository");
    templateFixture = (async () => {
      const published = await publishLinkedWayfinding(templateRepository);
      await fs.cp(templateRepository, publishedTemplateRepository, {
        recursive: true,
        mode: fsConstants.COPYFILE_FICLONE,
      });
      const arranged = await arrangeReaderRepository(
        templateRepository,
        processPackage,
        processRef,
        published,
      );
      return deepFreeze({ published, arranged });
    })();
  });

  beforeEach(async () => {
    parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-reader-inspection-"));
    repository = path.join(parent, "repository");
  });

  async function installPublishedTemplate(): Promise<
    Awaited<ReturnType<typeof publishLinkedWayfinding>>
  > {
    const fixture = await templateFixture;
    await fs.cp(publishedTemplateRepository, repository, {
      recursive: true,
      mode: fsConstants.COPYFILE_FICLONE,
    });
    return structuredClone(fixture.published);
  }

  async function installArrangedTemplate(): Promise<
    Awaited<ReturnType<typeof arrangeReaderRepository>>
  > {
    const fixture = await templateFixture;
    await fs.cp(templateRepository, repository, {
      recursive: true,
      mode: fsConstants.COPYFILE_FICLONE,
    });
    return structuredClone(fixture.arranged);
  }

  afterEach(async () => {
    await fs.rm(parent, { recursive: true, force: true });
  });

  afterAll(async () => {
    await templateFixture;
    await fs.rm(templateParent, { recursive: true, force: true });
  });

  it("reloads repository data when execution provenance changes", async () => {
    const published = await installPublishedTemplate();
    const initial = await readRepositoryData(repository, processPackage);
    expect(initial.ok).toBe(true);
    if (!initial.ok) return;
    const map = initial.value.find((item) =>
      item.lifecycleDatum.datum.revision_id === published.map.lifecycleDatum.revisionId
    )!;
    expect(map.lifecycleDatum.integrity.scenario_execution_valid).toBe(true);
    (map.lifecycleDatum.datum.payload as Record<string, unknown>).title =
      "Caller mutation must not affect a later repository read";
    const isolated = await readRepositoryData(repository, processPackage);
    expect(isolated.ok).toBe(true);
    if (!isolated.ok) return;
    expect(isolated.value.find((item) =>
      item.lifecycleDatum.datum.revision_id === published.map.lifecycleDatum.revisionId
    )?.lifecycleDatum.datum.payload.title).toBe("Linked reader graph");

    const mutatedPackage = structuredClone(processPackage);
    const mapPayloadSchema = mutatedPackage.types.MAP?.payload_schema as {
      required: string[];
    };
    mapPayloadSchema.required.push("cache_poison_marker");
    const packageMutation = await readRepositoryData(repository, mutatedPackage);
    expect(packageMutation.ok).toBe(false);
    if (packageMutation.ok) return;
    expect(packageMutation.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "datum-payload" }),
    ]));

    const transaction = /^\.lifecycle\/data\/\.transactions\/([^/]+)\//
      .exec(map.relativePath)?.[1];
    expect(transaction).toBeDefined();
    const executionPath = path.join(
      repository,
      ".lifecycle/data/.transactions",
      transaction!,
      "execution.json",
    );
    const execution = JSON.parse(await fs.readFile(executionPath, "utf8"));
    execution.status = "failed";
    await fs.writeFile(executionPath, `${JSON.stringify(execution, null, 2)}\n`);

    const changed = await readRepositoryData(repository, processPackage);
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;
    expect(changed.value.find((item) =>
      item.lifecycleDatum.datum.revision_id === published.map.lifecycleDatum.revisionId
    )?.lifecycleDatum.integrity.scenario_execution_valid).toBe(false);
  });

  it("shows and lists exact data while preserving linked multi-Revision history", async () => {
    const { map, question, baseline, secondMap } = await installArrangedTemplate();

    const stableShow = await mdlm(repository, "show", map.lifecycleDatum.id, "--json");
    expectSuccess(stableShow, "mdlm show <stable-id>");
    expect(JSON.parse(stableShow.stdout)).toMatchObject({
      command: "show",
      lifecycleDatum: {
        datum: {
          id: map.lifecycleDatum.id,
          revision: 2,
          revision_id: secondMap.revision_id,
          payload: { title: "Linked reader graph, revised" },
          links: [{ type: "indexes", target: question.lifecycleDatum.id }],
          body: "The second exact graph revision.\n",
        },
        storage: { editable: true, frozen: false },
      },
      projections: { backlinks: [] },
    });

    const exactShow = await showDatum(
      repository,
      processPackage,
      processRef,
      map.lifecycleDatum.revisionId,
    );
    expect(exactShow.ok).toBe(true);
    if (!exactShow.ok) return;
    expect(exactShow.value.lifecycleDatum).toMatchObject({
      datum: {
        revision: 1,
        revision_id: map.lifecycleDatum.revisionId,
        body: "The first exact graph revision.\n",
      },
      storage: { editable: false, frozen: true },
    });

    const listed = await listData(repository, processPackage, processRef);
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const data = listed.value;
    expect(data).toHaveLength(3);
    expect(data.map((item) => item.lifecycleDatum.datum.revision_id)).toEqual(
      expect.arrayContaining([
        secondMap.revision_id,
        question.lifecycleDatum.revisionId,
        baseline.revision_id,
      ]),
    );
    expect(data.map((item) => item.lifecycleDatum.datum.revision_id))
      .not.toContain(map.lifecycleDatum.revisionId);

    const history = await datumHistory(
      repository,
      processPackage,
      map.lifecycleDatum.id,
    );
    expect(history.ok).toBe(true);
    if (!history.ok) return;
    expect(history.value).toEqual({
      id: map.lifecycleDatum.id,
      type: "MAP",
      revisions: [{
        revision: 1,
        revisionId: map.lifecycleDatum.revisionId,
        classification: "frozen-history",
        frozenBy: [baseline.revision_id],
        processRef: map.data.created_by.process_ref,
      }, {
        revision: 2,
        revisionId: secondMap.revision_id,
        classification: "editable-work",
        frozenBy: [],
        processRef: map.data.created_by.process_ref,
      }],
    });
  });

  it("computes backlinks and relation-filtered traces from source-owned links", async () => {
    const { map, question, secondMap } = await installArrangedTemplate();

    const backlinks = await inspectBacklinks(
      repository,
      processPackage,
      question.lifecycleDatum.id,
    );
    expect(backlinks.ok).toBe(true);
    if (!backlinks.ok) return;
    expect(backlinks.value).toEqual({
      identity: question.lifecycleDatum.id,
      identityKind: "stable-datum",
      type: "QST",
      links: [{
        source: map.lifecycleDatum.revisionId,
        sourceIdentityKind: "revision",
        sourceType: "MAP",
        type: "indexes",
        target: question.lifecycleDatum.id,
        targetIdentityKind: "stable-datum",
        inverseLabel: "indexed-by",
      }, {
        source: secondMap.revision_id,
        sourceIdentityKind: "revision",
        sourceType: "MAP",
        type: "indexes",
        target: question.lifecycleDatum.id,
        targetIdentityKind: "stable-datum",
        inverseLabel: "indexed-by",
      }],
    });

    const indexedTrace = await traceGraph(
      repository,
      processPackage,
      question.lifecycleDatum.id,
      "indexes",
      1,
    );
    expect(indexedTrace.ok).toBe(true);
    if (!indexedTrace.ok) return;
    expect(indexedTrace.value).toMatchObject({
      root: {
        identity: question.lifecycleDatum.id,
        identityKind: "stable-datum",
        type: "QST",
      },
      depth: 1,
      relation: "indexes",
      nodes: expect.arrayContaining([
        expect.objectContaining({ identity: question.lifecycleDatum.id }),
        expect.objectContaining({ identity: map.lifecycleDatum.revisionId }),
        expect.objectContaining({ identity: secondMap.revision_id }),
      ]),
      links: [
        expect.objectContaining({ source: map.lifecycleDatum.revisionId }),
        expect.objectContaining({ source: secondMap.revision_id }),
      ],
    });

    const sourceTrace = await traceGraph(
      repository,
      processPackage,
      map.lifecycleDatum.id,
      "indexes",
      1,
    );
    expect(sourceTrace.ok).toBe(true);
    if (!sourceTrace.ok) return;
    expect(sourceTrace.value).toMatchObject({
      root: {
        identity: map.lifecycleDatum.id,
        identityKind: "stable-datum",
        type: "MAP",
      },
      relation: "indexes",
      links: [
        expect.objectContaining({
          source: map.lifecycleDatum.revisionId,
          target: question.lifecycleDatum.id,
          inverseLabel: "indexed-by",
        }),
        expect.objectContaining({
          source: secondMap.revision_id,
          target: question.lifecycleDatum.id,
          inverseLabel: "indexed-by",
        }),
      ],
    });
  });

  it("rebuilds disposable index and report projections from Markdown truth", async () => {
    const { map, secondMap } = await installArrangedTemplate();
    const loadedInspection = await loadRepositoryInspection(
      repository,
      processPackage,
      processRef,
    );
    expect(loadedInspection.ok).toBe(true);
    if (!loadedInspection.ok) return;
    const inspection = loadedInspection.value;
    const baselineVerification = await inspection.verifyBaselines();
    expect(baselineVerification.ok).toBe(true);
    if (!baselineVerification.ok) return;
    expect(baselineVerification.value).toMatchObject({
      verifiedBaselines: 1,
      processDrift: 0,
    });
    const firstDoctor = await inspection.rebuildGeneratedProjections();
    expect(firstDoctor.ok).toBe(true);
    if (!firstDoctor.ok) return;
    expect(firstDoctor.value).toMatchObject({
      index: {
        rebuilt: true,
        data: 4,
        path: ".lifecycle/generated/indexes/data.json",
      },
      report: {
        rebuilt: true,
        data: 3,
        path: ".lifecycle/generated/reports/lifecycle.json",
      },
    });

    const shownBeforeDeletion = await showDatum(
      repository,
      processPackage,
      processRef,
      map.lifecycleDatum.id,
    );
    expect(shownBeforeDeletion.ok).toBe(true);
    if (!shownBeforeDeletion.ok) return;
    await fs.rm(path.join(repository, ".lifecycle/generated"), {
      recursive: true,
      force: true,
    });
    const shownAfterDeletion = await showDatum(
      repository,
      processPackage,
      processRef,
      map.lifecycleDatum.id,
    );
    expect(shownAfterDeletion.ok).toBe(true);
    if (!shownAfterDeletion.ok) return;
    expect(shownAfterDeletion.value).toEqual(shownBeforeDeletion.value);

    const rebuilt = await inspection.rebuildGeneratedProjections();
    expect(rebuilt.ok).toBe(true);
    if (!rebuilt.ok) return;
    expect(rebuilt.value).toMatchObject({
      index: { rebuilt: true, data: 4 },
      report: { rebuilt: true, data: 3 },
    });
    const index = JSON.parse(await fs.readFile(
      path.join(repository, ".lifecycle/generated/indexes/data.json"),
      "utf8",
    ));
    expect(index.data.map((item: { revisionId: string }) => item.revisionId))
      .toEqual(expect.arrayContaining([
        map.lifecycleDatum.revisionId,
        secondMap.revision_id,
      ]));
    const report = JSON.parse(await fs.readFile(
      path.join(repository, ".lifecycle/generated/reports/lifecycle.json"),
      "utf8",
    ));
    expect(report.data).toHaveLength(3);

    const unchanged = await inspection.rebuildGeneratedProjections();
    expect(unchanged.ok).toBe(true);
    if (!unchanged.ok) return;
    expect(unchanged.value).toMatchObject({
      index: { rebuilt: false },
      report: { rebuilt: false },
    });
  });
});

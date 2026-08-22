import { spawn, spawnSync } from "node:child_process";
import { constants as fsConstants, promises as fs, watch } from "node:fs";
import os from "node:os";
import path from "node:path";
import { stringify } from "yaml";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { executeCommandApplication } from "../src/command-application.js";
import { loadProcessPackage, type DatumEnvelope, type ProcessPackage } from "../src/index.js";
import { initializeRepositoryFromLoadedProcessPackage } from "../src/repository-initialization.js";
import {
  finalizeExactBaselineScenarioOutput,
  verifyExactBaseline,
} from "../src/exact-baseline-repository.js";
import {
  publishScenarioMutationData,
  readRepositoryData,
  verifyRepositoryDataSources,
} from "../src/lifecycle-repository.js";
import { collectPerformanceDiagnostics } from "../src/performance-diagnostics.js";
import { loadRepositoryInspection } from "../src/repository-inspection.js";
import { mdlmWithEnvironment } from "./helpers/mdlm.js";

const CONTENDED_BASELINE_SETUP_HOOK_TIMEOUT_MS = 30_000;
const CONTENDED_CHANGED_SETUP_HOOK_TIMEOUT_MS = 20_000;
const CONTENDED_HISTORICAL_SETUP_HOOK_TIMEOUT_MS = 20_000;
const CONTENDED_TEST_SETUP_HOOK_TIMEOUT_MS = 20_000;

async function executeMdlm(repository: string, ...arguments_: string[]) {
  const execution = await executeCommandApplication(arguments_, repository);
  return { status: execution.exitCode, stdout: execution.output, stderr: "" };
}

type WrittenDatum = { datum: DatumEnvelope; path: string };
type SelectedPackageFixture = {
  processPackage: ProcessPackage;
  processRef: string;
};
type BaselineFixture = {
  before: WrittenDatum;
  after: WrittenDatum;
  firstMap: WrittenDatum;
  secondMap: WrittenDatum;
  oldEvidence: WrittenDatum;
  newEvidence: WrittenDatum;
};

async function copyRepositoryFoundation(
  source: string,
  destination: string,
): Promise<void> {
  await fs.cp(source, destination, {
    recursive: true,
    mode: fsConstants.COPYFILE_FICLONE,
  });
}

function expectSuccess(
  result: { status: number | null; stdout: string; stderr: string },
  command: string,
): void {
  expect(result.status, `${command}\n${result.stderr}${result.stdout}`).toBe(0);
}

function git(repository: string, arguments_: string[], input?: string) {
  return spawnSync("git", ["-C", repository, ...arguments_], {
    encoding: "utf8",
    ...(input === undefined ? {} : { input }),
  });
}

function holdPublicationLock(repository: string, owner: string): string {
  const hashed = git(
    repository,
    ["hash-object", "-w", "--stdin"],
    owner,
  );
  expect(hashed.status, hashed.stderr).toBe(0);
  const objectId = hashed.stdout.trim();
  const locked = git(repository, [
    "update-ref",
    "refs/mdlm/publication-lock",
    objectId,
    "0000000000000000000000000000000000000000",
  ]);
  expect(locked.status, locked.stderr).toBe(0);
  return objectId;
}

function cloneHistoricalRepository(parent: string): string {
  const repository = path.join(parent, "historical-source");
  const cloned = spawnSync(
    "git",
    [
      "clone",
      path.resolve(
        "test/fixtures/phase-hardening/calculator-stale-dwp-ready-0.66.0.bundle",
      ),
      repository,
    ],
    { encoding: "utf8" },
  );
  expect(
    cloned.status,
    `git clone historical fixture\n${cloned.stderr}${cloned.stdout}`,
  ).toBe(0);
  return repository;
}

async function nextDuringTrackedChanges(
  repository: string,
): Promise<{ exit: number | null; stderr: string; stdout: string }> {
  const child = spawn(
    process.execPath,
    [path.resolve("dist/mdlm.js"), "next", "--json"],
    { cwd: repository },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => stdout += chunk);
  child.stderr.on("data", (chunk: string) => stderr += chunk);
  let keepMutating = true;
  const mutations = (async () => {
    let revision = 0;
    while (keepMutating) {
      revision += 1;
      await fs.appendFile(
        path.join(repository, ".gitignore"),
        `# concurrent tracked change ${revision}\n`,
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  })();
  const exit = await new Promise<number | null>((resolve) =>
    child.on("close", resolve)
  );
  keepMutating = false;
  await mutations;
  return { exit, stderr, stdout };
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

let immutableSelectedPackage: SelectedPackageFixture | undefined;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

async function selectedPackage(
  repository: string,
  useCachedFixture = true,
): Promise<SelectedPackageFixture> {
  if (useCachedFixture && immutableSelectedPackage) return immutableSelectedPackage;
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

async function verifyBaseline(repository: string, identity: string) {
  const { processPackage, processRef } = await selectedPackage(repository);
  return verifyExactBaseline(repository, processPackage, processRef, identity);
}

async function inspectRepositoryHealth(repository: string) {
  const { processPackage, processRef } = await selectedPackage(repository);
  const inspection = await loadRepositoryInspection(
    repository,
    processPackage,
    processRef,
  );
  if (!inspection.ok) return inspection;
  const verified = await inspection.value.verifyBaselines();
  if (!verified.ok) return verified;
  const projections = await inspection.value.rebuildGeneratedProjections();
  if (!projections.ok) return projections;
  return {
    ok: true as const,
    value: {
      baselineRepositoryVerification: verified.value,
      index: projections.value.index,
      report: projections.value.report,
    },
    diagnostics: [],
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

async function arrangeManyBaselines(
  source: string,
  destination: string,
  fixture: BaselineFixture,
): Promise<void> {
  await copyRepositoryFoundation(source, destination);
  const template = fixture.before.datum;
  await Promise.all(Array.from({ length: 29 }, async (_, index) => {
    const id = `BSL-10500000${String(index + 1).padStart(2, "0")}`;
    const revisionId = `${id}-r00001`;
    const snapshot = structuredClone(template.payload.snapshot) as {
      resolved_links: Record<string, string[]>;
    };
    const selfLinks = snapshot.resolved_links[template.revision_id] ?? [];
    delete snapshot.resolved_links[template.revision_id];
    snapshot.resolved_links[revisionId] = selfLinks;
    await writeDatum(destination, {
      ...structuredClone(template),
      id,
      revision_id: revisionId,
      payload: {
        ...structuredClone(template.payload),
        title: `Exact baseline ${index + 3}`,
        group: "many-baseline-verification",
        snapshot,
      },
    });
  }));
}

describe("mdlm baseline inspection", () => {
  const changedBaselineTests = new Set([
    "verifies exact members and evidence and reports substantive baseline differences",
    "detects changed bytes, missing exact members, and corrupt frozen resolutions",
    "loads one verified repository snapshot while checking all baselines and projections",
    "loads one snapshot for current-package baseline operator inspection",
    "verifies every repository baseline before rebuilding disposable projections",
  ]);
  let templateParent: string;
  let templateRepository: string;
  let changedTemplateRepository: string;
  let changedBaselineFixture: BaselineFixture;
  let manyBaselineTemplateRepository: string;
  let historicalProcessRoot: string;
  let historicalProcessPackage: ProcessPackage;
  let historicalProcessRef: string;
  let historicalRepository: string;
  let historicalBaselineRevision: string;
  let parent: string;
  let repository: string;

  beforeAll(async () => {
    templateParent = await fs.mkdtemp(path.join(
      os.tmpdir(),
      "mdlm-baseline-inspection-template-",
    ));
    templateRepository = path.join(templateParent, "repository");
    const processRoot = path.resolve(".lifecycle/process");
    const loaded = await loadProcessPackage(processRoot);
    expect(loaded.ok, loaded.ok ? "" : JSON.stringify(loaded.diagnostics)).toBe(true);
    if (!loaded.ok) return;
    const initialized = await initializeRepositoryFromLoadedProcessPackage(
      templateRepository,
      processRoot,
      loaded.package,
    );
    expect(initialized.ok, initialized.ok ? "" : JSON.stringify(initialized.diagnostics))
      .toBe(true);
    if (!initialized.ok) return;
    immutableSelectedPackage = deepFreeze({
      processPackage: loaded.package,
      processRef: `${initialized.package.reference}#${initialized.package.digest}`,
    });
  }, CONTENDED_BASELINE_SETUP_HOOK_TIMEOUT_MS);

  beforeAll(async () => {
    changedTemplateRepository = path.join(templateParent, "changed-repository");
    await copyRepositoryFoundation(templateRepository, changedTemplateRepository);
    changedBaselineFixture = deepFreeze(
      await arrangeChangedBaselines(changedTemplateRepository),
    );
  }, CONTENDED_CHANGED_SETUP_HOOK_TIMEOUT_MS);

  beforeAll(async () => {
    manyBaselineTemplateRepository = path.join(
      templateParent,
      "many-baseline-repository",
    );
    await arrangeManyBaselines(
      changedTemplateRepository,
      manyBaselineTemplateRepository,
      changedBaselineFixture,
    );
  });

  beforeAll(async () => {
    const historicalSource = cloneHistoricalRepository(templateParent);
    const selection = JSON.parse(await fs.readFile(
      path.join(historicalSource, ".lifecycle/process-selection.json"),
      "utf8",
    )) as { package: { path: string } };
    historicalProcessRoot = path.resolve(historicalSource, selection.package.path);
    const loaded = await loadProcessPackage(historicalProcessRoot);
    expect(loaded.ok, loaded.ok ? "" : JSON.stringify(loaded.diagnostics)).toBe(true);
    if (!loaded.ok) return;
    historicalProcessPackage = deepFreeze(loaded.package);
  }, CONTENDED_HISTORICAL_SETUP_HOOK_TIMEOUT_MS);

  beforeAll(async () => {
    historicalRepository = path.join(templateParent, "historical-baseline");
    const initialized = await initializeRepositoryFromLoadedProcessPackage(
      historicalRepository,
      historicalProcessRoot,
      historicalProcessPackage,
    );
    expect(initialized.ok, initialized.ok ? "" : JSON.stringify(initialized.diagnostics))
      .toBe(true);
    if (!initialized.ok) return;
    historicalProcessRef =
      `${initialized.package.reference}#${initialized.package.digest}`;
    const evidence = await writeDatum(
      historicalRepository,
      question(historicalProcessRef, "QST-1060000001", "Historical evidence"),
    );
    const member = await writeDatum(
      historicalRepository,
      mapRevision(historicalProcessRef, 1, evidence.datum.id),
    );
    const baselineId = "BSL-1060000001";
    const baseline = await freezeBaseline(
      historicalRepository,
      historicalProcessPackage,
      historicalProcessRef,
      {
        id: baselineId,
        revision: 1,
        revision_id: `${baselineId}-r00001`,
        type: "BSL",
        payload: {
          title: "Historical-package exact baseline",
          kind: "level-candidate",
          role: "candidate",
          scope: "historical compatibility",
          group: "inspection",
          definition_members: [member.datum.revision_id],
          evidence: [evidence.datum.revision_id],
        },
        links: [],
        created_by: authoring(
          historicalProcessRef,
          "create-candidate-baseline@1",
          "prompts/create-candidate-baseline.md@1",
        ),
        body: "One bounded historical-package exact baseline.\n",
      },
    );
    historicalBaselineRevision = baseline.datum.revision_id;
  });

  beforeEach(async ({ task }) => {
    parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-baseline-inspection-"));
    repository = path.join(parent, "repository");
    await copyRepositoryFoundation(
      changedBaselineTests.has(task.name)
        ? changedTemplateRepository
        : templateRepository,
      repository,
    );
  }, CONTENDED_TEST_SETUP_HOOK_TIMEOUT_MS);

  afterEach(async () => {
    await fs.rm(parent, { recursive: true, force: true });
  });

  afterAll(async () => {
    immutableSelectedPackage = undefined;
    await fs.rm(templateParent, { recursive: true, force: true });
  });

  it("verifies shared composed descendants once while finalizing a baseline", async () => {
    const { processPackage, processRef } = await selectedPackage(repository);
    const baseline = (
      id: string,
      title: string,
      composition: string[] = [],
    ): DatumEnvelope => ({
      id,
      revision: 1,
      revision_id: `${id}-r00001`,
      type: "BSL",
      payload: {
        title,
        kind: "level-candidate",
        role: "candidate",
        scope: title,
        group: "composition-cache",
        definition_members: [],
        evidence: [],
      },
      links: composition.map((target) => ({ type: "composes", target })),
      created_by: authoring(
        processRef,
        "create-candidate-baseline@1",
        "prompts/create-candidate-baseline.md@1",
      ),
      body: `${title}.\n`,
    });
    const shared = await freezeBaseline(
      repository,
      processPackage,
      processRef,
      baseline("BSL-1040000101", "Shared descendant"),
    );
    const left = await freezeBaseline(
      repository,
      processPackage,
      processRef,
      baseline("BSL-1040000102", "Left parent", [shared.datum.revision_id]),
    );
    const right = await freezeBaseline(
      repository,
      processPackage,
      processRef,
      baseline("BSL-1040000103", "Right parent", [shared.datum.revision_id]),
    );

    const result = await collectPerformanceDiagnostics(() =>
      finalizeExactBaselineScenarioOutput(
        repository,
        processPackage,
        processRef,
        baseline("BSL-1040000104", "Composed root", [
          left.datum.revision_id,
          right.datum.revision_id,
        ]),
      ),
    );

    expect(result.value.ok).toBe(true);
    expect(result.diagnostics.work["baseline.revisions-checked"]).toBe(3);
  });

  it("shares composed-baseline verification across one command transaction", async () => {
    const { processPackage, processRef } = await selectedPackage(repository);
    const baseline = (id: string, composition: string[] = []): DatumEnvelope => ({
      id,
      revision: 1,
      revision_id: `${id}-r00001`,
      type: "BSL",
      payload: {
        title: id,
        kind: "level-candidate",
        role: "candidate",
        scope: id,
        group: "transaction-cache",
        definition_members: [],
        evidence: [],
      },
      links: composition.map((target) => ({ type: "composes", target })),
      created_by: authoring(
        processRef,
        "create-candidate-baseline@1",
        "prompts/create-candidate-baseline.md@1",
      ),
      body: `${id}.\n`,
    });
    const shared = await freezeBaseline(
      repository,
      processPackage,
      processRef,
      baseline("BSL-1040000201"),
    );
    const inspection = await loadRepositoryInspection(
      repository,
      processPackage,
      processRef,
    );
    expect(inspection.ok).toBe(true);
    if (!inspection.ok) throw new Error("repository inspection unavailable");
    const transaction = inspection.value.beginTransaction();

    const result = await collectPerformanceDiagnostics(async () => {
      const first = await transaction.finalizeExactBaseline(
        baseline("BSL-1040000202", [shared.datum.revision_id]),
      );
      const second = await transaction.finalizeExactBaseline(
        baseline("BSL-1040000203", [shared.datum.revision_id]),
      );
      return { first, second };
    });

    expect(result.value.first.ok).toBe(true);
    expect(result.value.second.ok).toBe(true);
    expect(result.diagnostics.work["baseline.revisions-checked"]).toBe(1);
  });

  it("rejects transaction publication after authoritative Markdown changes", async () => {
    const { processPackage, processRef } = await selectedPackage(repository);
    const written = await writeDatum(
      repository,
      question(processRef, "QST-1040000301", "Inspected transaction source"),
    );
    const inspection = await loadRepositoryInspection(
      repository,
      processPackage,
      processRef,
    );
    expect(inspection.ok).toBe(true);
    if (!inspection.ok) throw new Error("repository inspection unavailable");
    const snapshot = inspection.value.lifecycleSnapshot("phase-0-wayfinding");
    const transaction = inspection.value.beginTransaction();

    await fs.appendFile(path.join(repository, written.path), "Intervening change.\n");
    const published = await transaction.publishScenarioMutation(
      snapshot.records.map((record) => record.datum),
      [],
      "execution-after-intervening-change",
      {},
    );

    expect(published).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({
        code: "scenario-repository-changed",
        path: written.path,
      })],
    });
  });

  it("checks authoritative Markdown after staging and before publication", async () => {
    const { processPackage, processRef } = await selectedPackage(repository);
    const written = await writeDatum(
      repository,
      question(processRef, "QST-1040000302", "Staged transaction source"),
    );
    const loaded = await readRepositoryData(repository, processPackage);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw new Error("repository data unavailable");
    const executionId = "execution-changed-after-staging";
    let observedStagingDirectory = false;

    const published = await publishScenarioMutationData(
      repository,
      processPackage,
      loaded.value,
      loaded.value.map((item) => item.lifecycleDatum.datum),
      [],
      executionId,
      {},
      [],
      async () => {
        const lifecycleEntries = await fs.readdir(path.join(repository, ".lifecycle"));
        observedStagingDirectory = lifecycleEntries.some((entry) =>
          entry.startsWith(`.scenario-${executionId}.`) && entry.endsWith(".tmp")
        );
        await fs.appendFile(
          path.join(repository, written.path),
          "Change after staging.\n",
        );
        return verifyRepositoryDataSources(repository, loaded.value);
      },
    );

    expect(observedStagingDirectory).toBe(true);
    expect(published).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({
        code: "scenario-repository-changed",
        path: written.path,
      })],
    });
    await expect(fs.access(path.join(
      repository,
      ".lifecycle/data/.transactions",
      executionId,
    ))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("serializes source verification with the publication commit", async () => {
    const { processPackage, processRef } = await selectedPackage(repository);
    const loaded = await readRepositoryData(repository, processPackage);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw new Error("repository data unavailable");
    const expected = loaded.value.map((item) => item.lifecycleDatum.datum);
    const proposal = question(
      processRef,
      "QST-1040000303",
      "Concurrent publication source",
    );
    holdPublicationLock(
      repository,
      `${JSON.stringify({
        expiresAt: Date.now() + 60_000,
        pid: 2_147_483_647,
        token: "contended-stale-owner",
      })}\n`,
    );
    let commitGuardCalls = 0;
    let firstGuardStarted: (() => void) | undefined;
    const firstGuard = new Promise<void>((resolve) => {
      firstGuardStarted = resolve;
    });
    let releaseFirstGuard: (() => void) | undefined;
    const firstGuardRelease = new Promise<void>((resolve) => {
      releaseFirstGuard = resolve;
    });
    const commitGuard = async () => {
      commitGuardCalls += 1;
      if (commitGuardCalls === 1) {
        firstGuardStarted?.();
        await firstGuardRelease;
      }
      return verifyRepositoryDataSources(repository, loaded.value);
    };

    const secondStaged = new Promise<void>((resolve, reject) => {
      const watcher = watch(path.join(repository, ".lifecycle"), async () => {
        try {
          const entries = await fs.readdir(path.join(repository, ".lifecycle"));
          if (entries.some((entry) =>
            entry.startsWith(".scenario-concurrent-publication-right.") &&
            entry.endsWith(".tmp")
          )) {
            watcher.close();
            resolve();
          }
        } catch (error) {
          watcher.close();
          reject(error);
        }
      });
    });
    const firstPublication = publishScenarioMutationData(
      repository,
      processPackage,
      loaded.value,
      expected,
      [proposal],
      "concurrent-publication-left",
      {},
      [],
      commitGuard,
    );
    const secondPublication = publishScenarioMutationData(
      repository,
      processPackage,
      loaded.value,
      expected,
      [{ ...structuredClone(proposal), body: "Competing publication.\n" }],
      "concurrent-publication-right",
      {},
      [],
      commitGuard,
    );
    await Promise.all([firstGuard, secondStaged]);
    expect(commitGuardCalls).toBe(1);
    releaseFirstGuard?.();

    const results = await Promise.all([
      firstPublication,
      secondPublication,
    ]);

    expect(commitGuardCalls).toBe(2);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      expect.objectContaining({
        diagnostics: [expect.objectContaining({
          code: "scenario-repository-changed",
        })],
      }),
    ]);
  });

  it.each([
    ["owner exited", `${JSON.stringify({
      expiresAt: Date.now() + 60_000,
      pid: 2_147_483_647,
      token: "exited-owner",
    })}\n`],
    ["the owner lease expired", `${JSON.stringify({
      expiresAt: Date.now() - 1,
      pid: process.pid,
      token: "expired-owner",
    })}\n`],
    ["owner metadata is malformed", "not-json\n"],
  ])("recovers a publication lock when %s", async (_case, owner) => {
    const { processPackage } = await selectedPackage(repository);
    const loaded = await readRepositoryData(repository, processPackage);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw new Error("repository data unavailable");
    holdPublicationLock(repository, owner);

    const published = await publishScenarioMutationData(
      repository,
      processPackage,
      loaded.value,
      loaded.value.map((item) => item.lifecycleDatum.datum),
      [],
      "publication-after-exited-owner",
      {},
      [],
      () => verifyRepositoryDataSources(repository, loaded.value),
    );

    expect(published.ok).toBe(true);
    expect(git(repository, [
      "rev-parse",
      "--verify",
      "refs/mdlm/publication-lock",
    ]).status).not.toBe(0);
  });

  it("fences a publisher that loses lock ownership before commit", async () => {
    const { processPackage } = await selectedPackage(repository);
    const loaded = await readRepositoryData(repository, processPackage);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw new Error("repository data unavailable");
    const executionId = "publication-after-lock-takeover";
    let takeoverObjectId = "";

    const published = await publishScenarioMutationData(
      repository,
      processPackage,
      loaded.value,
      loaded.value.map((item) => item.lifecycleDatum.datum),
      [],
      executionId,
      {},
      [],
      async () => {
        const sources = await verifyRepositoryDataSources(repository, loaded.value);
        if (!sources.ok) return sources;
        const current = git(repository, [
          "rev-parse",
          "--verify",
          "refs/mdlm/publication-lock",
        ]).stdout.trim();
        const takeover = git(
          repository,
          ["hash-object", "-w", "--stdin"],
          `${JSON.stringify({
            expiresAt: Date.now() + 60_000,
            pid: process.pid,
            token: "takeover",
          })}\n`,
        );
        expect(takeover.status, takeover.stderr).toBe(0);
        takeoverObjectId = takeover.stdout.trim();
        expect(git(repository, [
          "update-ref",
          "refs/mdlm/publication-lock",
          takeoverObjectId,
          current,
        ]).status).toBe(0);
        return sources;
      },
    );

    expect(published).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({ code: "scenario-publication-failed" })],
    });
    await expect(fs.access(path.join(
      repository,
      ".lifecycle/data/.transactions",
      executionId,
    ))).rejects.toMatchObject({ code: "ENOENT" });
    expect(git(repository, [
      "update-ref",
      "-d",
      "refs/mdlm/publication-lock",
      takeoverObjectId,
    ]).status).toBe(0);
  });

  it("verifies exact members and evidence and reports substantive baseline differences", async () => {
    const fixture = structuredClone(changedBaselineFixture);
    const { processPackage, processRef } = await selectedPackage(repository);
    const loaded = await loadRepositoryInspection(
      repository,
      processPackage,
      processRef,
    );
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));

    for (const baseline of [fixture.before, fixture.after]) {
      const verified = await loaded.value.verifyExactBaseline(
        baseline.datum.revision_id,
      );
      expect(verified.ok).toBe(true);
      if (!verified.ok) throw new Error(JSON.stringify(verified.diagnostics));
      expect(verified.value).toEqual({
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

    const compared = await loaded.value.diffExactBaselines(
      fixture.before.datum.revision_id,
      fixture.after.datum.revision_id,
    );
    expect(compared.ok).toBe(true);
    if (!compared.ok) throw new Error(JSON.stringify(compared.diagnostics));
    const diff = compared.value;
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

  it("verifies the same raw bytes that were frozen when Markdown contains malformed UTF-8", async () => {
    const { processPackage, processRef } = await selectedPackage(repository);
    const evidence = await writeDatum(
      repository,
      question(processRef, "QST-1040000001", "Raw-byte evidence"),
    );
    const member = await writeDatum(
      repository,
      mapRevision(processRef, 1, evidence.datum.id),
    );
    await fs.appendFile(
      path.join(repository, member.path),
      Buffer.from([0xff, 0xfe]),
    );
    const baselineId = "BSL-1040000001";
    const baseline = await freezeBaseline(repository, processPackage, processRef, {
      id: baselineId,
      revision: 1,
      revision_id: `${baselineId}-r00001`,
      type: "BSL",
      payload: {
        title: "Raw-byte exact baseline",
        kind: "level-candidate",
        role: "candidate",
        scope: "raw-byte verification",
        group: "inspection",
        definition_members: [member.datum.revision_id],
        evidence: [evidence.datum.revision_id],
      },
      links: [],
      created_by: authoring(
        processRef,
        "create-candidate-baseline@1",
        "prompts/create-candidate-baseline.md@1",
      ),
      body: "Freeze exact malformed UTF-8 member bytes.\n",
    });

    const verified = await verifyBaseline(repository, baseline.datum.revision_id);
    expect(verified.ok).toBe(true);
    if (!verified.ok) throw new Error(JSON.stringify(verified.diagnostics));
  });

  it("detects changed bytes, missing exact members, and corrupt frozen resolutions", async () => {
    const fixture = structuredClone(changedBaselineFixture);
    const memberPath = path.join(repository, fixture.firstMap.path);
    const memberBytes = await fs.readFile(memberPath, "utf8");

    await fs.writeFile(memberPath, `${memberBytes}changed frozen byte\n`);
    const hashFailure = await verifyBaseline(
      repository,
      fixture.before.datum.revision_id,
    );
    expect(hashFailure.ok).toBe(false);
    expect(hashFailure.diagnostics).toEqual(
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
    const resolutionFailure = await verifyBaseline(
      repository,
      fixture.before.datum.revision_id,
    );
    expect(resolutionFailure.ok).toBe(false);
    expect(resolutionFailure.diagnostics).toEqual(
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
    const missingTarget = await verifyBaseline(
      repository,
      fixture.before.datum.revision_id,
    );
    expect(missingTarget.ok).toBe(false);
    expect(missingTarget.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({
        code: "baseline-reference-missing",
        path: `${fixture.oldEvidence.datum.id}-r00002`,
      })]),
    );

    await writeDatum(repository, fixture.before.datum);
    await fs.rm(memberPath);
    const missingMember = await verifyBaseline(
      repository,
      fixture.before.datum.revision_id,
    );
    expect(missingMember.ok).toBe(false);
    expect(missingMember.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({
        code: "baseline-reference-missing",
        path: fixture.firstMap.datum.revision_id,
      })]),
    );
  });

  it("loads one verified repository snapshot while checking all baselines and projections", async () => {
    const result = mdlmWithEnvironment(
      repository,
      { MDLM_PERFORMANCE: "json" },
      "doctor",
      "--json",
    );

    expectSuccess(result, "mdlm doctor with performance diagnostics");
    expect(JSON.parse(result.stderr)).toMatchObject({
      contract: "mdlm-performance@1",
      repository: {
        loads: 1,
        markdownFiles: 6,
      },
      work: {
        "baseline.revisions-checked": 2,
        "repository.index.records": 6,
        "repository.parse.records": 6,
        "repository.provenance.records": 6,
        "repository.report.records": 5,
        "repository.validation.records": 6,
      },
      stages: {
        "lifecycle.evaluation": { count: expect.any(Number) },
        "baseline.verification": {
          count: 1,
          milliseconds: expect.any(Number),
        },
        "repository.discovery": { count: 1 },
        "repository.parse": { count: 1 },
        "repository.provenance": { count: 1 },
        "repository.validation": { count: 1 },
        "repository.generated-projections": { count: 1 },
        "repository.index-rebuild": { count: 1 },
        "repository.report-rebuild": { count: 1 },
        "repository.report-projections": { count: 1 },
      },
    });
  });

  it("verifies a bounded historical-package exact baseline", async () => {
    expect(historicalProcessRef).toContain("mdlm-bootstrap@0.66.0#sha256:");
    const verified = await verifyExactBaseline(
      historicalRepository,
      historicalProcessPackage,
      historicalProcessRef,
      historicalBaselineRevision,
    );
    expect(verified.ok).toBe(true);
    if (!verified.ok) throw new Error(JSON.stringify(verified.diagnostics));
    expect(verified.value).toMatchObject({
      baselineRevision: historicalBaselineRevision,
      valid: true,
      checkedHashes: 2,
    });
  });

  it("loads one snapshot while verifying many exact baselines", async () => {
    const { processPackage, processRef } = await selectedPackage(
      manyBaselineTemplateRepository,
    );
    const result = await collectPerformanceDiagnostics(async () => {
      const inspection = await loadRepositoryInspection(
        manyBaselineTemplateRepository,
        processPackage,
        processRef,
      );
      expect(inspection.ok).toBe(true);
      if (!inspection.ok) throw new Error(JSON.stringify(inspection.diagnostics));
      return inspection.value.verifyBaselines();
    });
    expect(result.value.ok).toBe(true);
    if (!result.value.ok) throw new Error(JSON.stringify(result.value.diagnostics));
    expect(result.value.value.verifiedBaselines).toBeGreaterThan(30);
    expect(result.diagnostics).toMatchObject({
      contract: "mdlm-performance@1",
      repository: { loads: 1, markdownFiles: expect.any(Number) },
    });
    expect(result.diagnostics.repository.markdownFiles).toBeGreaterThan(30);
    expect(result.diagnostics.work["baseline.revisions-checked"])
      .toBeGreaterThan(30);
  }, 30_000);

  it("loads one snapshot for current-package baseline operator inspection", () => {
    const status = mdlmWithEnvironment(
      repository,
      { MDLM_PERFORMANCE: "json" },
      "status",
    );
    expectSuccess(status, "current-package baseline mdlm status");
    expect(status.stdout).toContain("Process Package: mdlm-bootstrap@0.74.0");
    expect(status.stdout).toContain("Current Operator Outcome:");
    expect(JSON.parse(status.stderr)).toMatchObject({
      contract: "mdlm-performance@1",
      repository: { loads: 1, markdownFiles: 6 },
      work: { "baseline.revisions-checked": 2 },
      stages: {
        "baseline.verification": { count: 1 },
        "lifecycle.evaluation": { count: 1 },
      },
    });
  });

  it("rejects Assignment preparation across concurrent tracked changes", async () => {
    const result = await nextDuringTrackedChanges(repository);
    expect(
      result.exit,
      `concurrent mdlm next\n${result.stderr}${result.stdout}`,
    ).toBe(1);
    expect(JSON.parse(result.stdout).diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({
        code: "assignment-repository-changed-during-inspection",
      })]),
    );
  }, 30_000);

  it("verifies every repository baseline before rebuilding disposable projections", async () => {
    const fixture = structuredClone(changedBaselineFixture);
    const initial = await inspectRepositoryHealth(repository);
    expect(initial.ok).toBe(true);
    if (!initial.ok) throw new Error(JSON.stringify(initial.diagnostics));
    expect(initial.value).toMatchObject({
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
    const rebuilt = await inspectRepositoryHealth(repository);
    expect(rebuilt.ok).toBe(true);
    if (!rebuilt.ok) throw new Error(JSON.stringify(rebuilt.diagnostics));
    expect(rebuilt.value).toMatchObject({
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

    const unhealthy = await inspectRepositoryHealth(repository);
    expect(unhealthy.ok).toBe(false);
    expect(unhealthy.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({
        code: "baseline-hash-mismatch",
        path: fixture.firstMap.datum.revision_id,
      })]),
    );
    expect(await fs.readFile(indexPath, "utf8")).toBe(generated.index);
    expect(await fs.readFile(reportPath, "utf8")).toBe(generated.report);
  });
});

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { directoryDigest } from "./helpers/assignment-submission.js";
import {
  mdlm,
  mdlmWithInput,
  selectProcessPackageFixture,
  stageProcessPackageFixture,
} from "./helpers/mdlm.js";

const bootstrapPackage = path.join(process.cwd(), ".lifecycle/process");

async function packageCopy(
  parent: string,
  name: string,
  version: string,
): Promise<string> {
  const root = path.join(parent, name);
  await fs.cp(bootstrapPackage, root, { recursive: true });
  const manifestPath = path.join(root, "manifest.yaml");
  await fs.writeFile(
    manifestPath,
    (await fs.readFile(manifestPath, "utf8")).replace(
      "version: 0.62.0",
      `version: ${version}`,
    ),
  );
  return root;
}

async function historicalBootstrap061Copy(parent: string): Promise<string> {
  const root = await packageCopy(parent, "historical-0.61.0", "0.61.0");
  const selectorPath = path.join(
    root,
    "selectors/verification-implementations-requiring-run.yaml",
  );
  await fs.writeFile(
    selectorPath,
    (await fs.readFile(selectorPath, "utf8"))
      .replace(
        "description: Current valid qualification and pilot implementations whose execution obligations are evaluated.",
        "description: Exact qualification and pilot implementations whose execution obligations are evaluated.",
      )
      .replace(
        '    && state(implementation, "validity") == "valid"\n' +
        '    && none("newer-revisions-for@1", {subject: implementation})\n',
        "",
      ),
  );
  return root;
}

async function contractBytes(repository: string): Promise<string> {
  const paths = [
    ".lifecycle/process-selection.json",
    ".lifecycle/repository.json",
  ];
  return JSON.stringify(await Promise.all(paths.map(async (relativePath) => [
    relativePath,
    await fs.readFile(path.join(repository, relativePath), "utf8"),
  ])));
}

describe("mdlm Process Package migration", () => {
  let parent: string;
  let repository: string;

  beforeEach(async () => {
    parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-migration-"));
    repository = path.join(parent, "repository");
    await fs.mkdir(repository);
  });

  afterEach(async () => {
    await fs.rm(parent, { recursive: true, force: true });
  });

  it("migrates preserved 0.61.0 state and its active Assignment to exact 0.62.0", async () => {
    const previousRoot = await historicalBootstrap061Copy(parent);
    await selectProcessPackageFixture(repository, previousRoot);
    const selectedBefore = JSON.parse(await fs.readFile(
      path.join(repository, ".lifecycle/process-selection.json"),
      "utf8",
    ));
    expect(selectedBefore.package).toEqual(expect.objectContaining({
      reference: "mdlm-bootstrap@0.61.0",
      digest: "sha256:fa547ead7a9eb2270b230efb2669996aee87defd9c76634b3017f9e85f5c2746",
    }));
    const initial = JSON.parse(mdlm(repository, "next").stdout);
    const initialPacket = JSON.parse(mdlm(
      repository,
      "scenario", "prepare", initial.assignment.id,
    ).stdout);
    const published = mdlmWithInput(
      repository,
      `${JSON.stringify({
        contract: "mdlm-assignment-response@1",
        assignment: initial.assignment.id,
        kind: "proposal",
        proposal: {
          outputs: [{
            localId: "map",
            name: "map",
            invocation: 0,
            lifecycleDatum: {
              type: "MAP",
              payload: {
                title: "Preserved 0.61.0 migration history",
                purpose: "Prove historical Lifecycle Data and Assignment compatibility.",
                frontier: ["Preserve one exact historical Scenario transaction"],
              },
              links: [],
              body: "One exact historical 0.61.0 transaction.\n",
            },
          }],
          completionEvidence: { summary: "Published preserved 0.61.0 history." },
          loadedSkillRefs: initialPacket.prompt.skills.map(
            (skill: { reference: string }) => skill.reference,
          ),
          authoritySupplies: [],
          standingDelegations: [],
        },
      })}\n`,
      "scenario", "submit",
    );
    expect(published.status, `${published.stderr}${published.stdout}`).toBe(0);
    const publication = JSON.parse(published.stdout);
    const mapId = publication.execution.outputs[0].lifecycleDatum.id as string;
    const historyBefore = mdlm(repository, "history", mapId, "--json");
    expect(historyBefore.status, `${historyBefore.stderr}${historyBefore.stdout}`).toBe(0);
    expect(historyBefore.stdout).toContain("mdlm-bootstrap@0.61.0");
    const dataBefore = await directoryDigest(path.join(repository, ".lifecycle/data"));
    const targetReference = await stageProcessPackageFixture(
      repository,
      bootstrapPackage,
    );
    const before = await contractBytes(repository);
    const next = mdlm(repository, "next", "--json");
    expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
    const assignment = JSON.parse(next.stdout).assignment.id as string;

    const migrated = mdlm(
      repository,
      "process",
      "migrate",
      targetReference,
      "--json",
    );

    expect(migrated.status, `${migrated.stderr}${migrated.stdout}`).toBe(0);
    expect(JSON.parse(migrated.stdout)).toEqual(expect.objectContaining({
      ok: true,
      command: "process.migrate",
      installed: true,
      selected: true,
      migration: {
        from: expect.objectContaining({
          reference: "mdlm-bootstrap@0.61.0",
          digest: "sha256:fa547ead7a9eb2270b230efb2669996aee87defd9c76634b3017f9e85f5c2746",
        }),
        to: expect.objectContaining({
          reference: "mdlm-bootstrap@0.62.0",
          digest: "sha256:38b4912e78d4524a5755bd8d5260eba092f4543666315a217bc0782244327ec1",
        }),
      },
      diagnostics: [],
    }));
    expect(await contractBytes(repository)).not.toBe(before);
    expect(await directoryDigest(path.join(repository, ".lifecycle/data"))).toBe(dataBefore);
    const historyAfter = mdlm(repository, "history", mapId, "--json");
    expect(historyAfter.status, `${historyAfter.stderr}${historyAfter.stdout}`).toBe(0);
    expect(JSON.parse(historyAfter.stdout).history).toEqual(
      JSON.parse(historyBefore.stdout).history,
    );
    expect(historyAfter.stdout).toContain("mdlm-bootstrap@0.61.0");
    const prepared = mdlm(
      repository,
      "scenario", "prepare", assignment, "--json",
    );
    expect(prepared.status, `${prepared.stderr}${prepared.stdout}`).toBe(0);
    expect(JSON.parse(prepared.stdout).assignment.id).toBe(assignment);
    expect(mdlm(repository, "doctor", "--json").status).toBe(0);
  }, 30_000);

  it("rejects an incompatible package without changing exact contract bytes", async () => {
    const previousRoot = await packageCopy(parent, "previous", "0.40.0");
    const incompatibleRoot = await packageCopy(parent, "incompatible", "0.58.0");
    const manifestPath = path.join(incompatibleRoot, "manifest.yaml");
    await fs.writeFile(
      manifestPath,
      (await fs.readFile(manifestPath, "utf8")).replace(
        "media_type: text/markdown",
        "media_type: text/plain",
      ),
    );
    await selectProcessPackageFixture(repository, previousRoot);
    const targetReference = await stageProcessPackageFixture(
      repository,
      incompatibleRoot,
    );
    const before = await contractBytes(repository);

    const migrated = mdlm(
      repository,
      "process",
      "migrate",
      targetReference,
      "--json",
    );

    expect(migrated.status).toBe(1);
    expect(JSON.parse(migrated.stdout).diagnostics).toContainEqual(
      expect.objectContaining({ code: "repository-contract-incompatible" }),
    );
    expect(await contractBytes(repository)).toBe(before);
  }, 30_000);

  it("refuses a staged package that changed after its exact digest was recorded", async () => {
    const previousRoot = await packageCopy(parent, "previous", "0.40.0");
    await selectProcessPackageFixture(repository, previousRoot);
    const targetReference = await stageProcessPackageFixture(
      repository,
      bootstrapPackage,
    );
    const targetObligation = path.join(
      repository,
      ".lifecycle/packages",
      targetReference,
      "obligations/review-context-required.yaml",
    );
    await fs.appendFile(targetObligation, "unexpected: true\n");
    const before = await contractBytes(repository);

    const migrated = mdlm(
      repository,
      "process",
      "migrate",
      targetReference,
      "--json",
    );

    expect(migrated.status).toBe(1);
    expect(JSON.parse(migrated.stdout).diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "meta-schema" }),
    ]));
    expect(await contractBytes(repository)).toBe(before);
  }, 30_000);
});

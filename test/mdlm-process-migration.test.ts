import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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
      "version: 0.66.0",
      `version: ${version}`,
    ),
  );
  return root;
}

async function historicalBootstrap065Copy(parent: string): Promise<string> {
  const fixture = path.join(
    process.cwd(),
    "test/fixtures/migration/calculator-dwp-stale-support-0.65.0.bundle",
  );
  const sourceRepository = path.join(parent, "historical-0.65.0-source");
  const cloned = spawnSync(
    "git",
    [
      "clone",
      "--quiet",
      "--branch",
      "bounded-authentic-fixture",
      fixture,
      sourceRepository,
    ],
    { encoding: "utf8" },
  );
  if (cloned.status !== 0) {
    throw new Error(`${cloned.stderr}${cloned.stdout}`);
  }
  const root = path.join(parent, "mdlm-bootstrap@0.65.0");
  await fs.cp(
    path.join(
      sourceRepository,
      ".lifecycle/packages/mdlm-bootstrap@0.65.0",
    ),
    root,
    { recursive: true },
  );
  return root;
}

async function contractBytes(repository: string): Promise<string> {
  const paths = [
    ".lifecycle/process-selection.json",
    ".lifecycle/repository.json",
  ];
  return JSON.stringify(
    await Promise.all(
      paths.map(async (relativePath) => [
        relativePath,
        await fs.readFile(path.join(repository, relativePath), "utf8"),
      ]),
    ),
  );
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

  it("migrates authentic 0.65.0 DWP Review and stale-support history unchanged", async () => {
    await fs.rm(repository, { recursive: true, force: true });
    const cloned = spawnSync(
      "git",
      [
        "clone",
        "--quiet",
        "--branch",
        "bounded-authentic-fixture",
        path.join(
          process.cwd(),
          "test/fixtures/migration/calculator-dwp-stale-support-0.65.0.bundle",
      ),
      repository,
    ],
      { encoding: "utf8" },
    );
    expect(cloned.status, `${cloned.stderr}${cloned.stdout}`).toBe(0);
    expect(
      spawnSync("git", ["-C", repository, "rev-parse", "HEAD"], {
        encoding: "utf8",
      }).stdout.trim(),
    ).toBe("82c383e3875ba349c23c17f87d53c16ffcf081ac");
    const preservedCalculatorHead =
      "c8c76418732271acef9ba448271cae5002bbecc6";
    const ancestry = spawnSync(
      "git",
      [
        "-C",
        repository,
        "merge-base",
        "--is-ancestor",
        preservedCalculatorHead,
        "HEAD",
      ],
      { encoding: "utf8" },
    );
    expect(ancestry.status, `${ancestry.stderr}${ancestry.stdout}`).toBe(0);
    const lifecycleDataDelta = spawnSync(
      "git",
      [
        "-C",
        repository,
        "diff",
        "--name-status",
        `${preservedCalculatorHead}..HEAD`,
        "--",
        ".lifecycle/data",
      ],
      { encoding: "utf8" },
    );
    expect(
      lifecycleDataDelta.status,
      `${lifecycleDataDelta.stderr}${lifecycleDataDelta.stdout}`,
    ).toBe(0);
    expect(
      createHash("sha256").update(lifecycleDataDelta.stdout).digest("hex"),
    ).toBe("84caf41221bdcd741e75a8b4677aa1a3c300183e544e6ac1ceeff828db4cc9a3");
    const deletedPaths = new Set(
      lifecycleDataDelta.stdout
        .trim()
        .split("\n")
        .map((line) => {
          const match = line.match(
            /^D\t(\.lifecycle\/data\/\.transactions\/[^/]+\/.+)$/,
          );
          expect(match, line).not.toBeNull();
          return match?.[1] ?? "";
        }),
    );
    const deletedTransactions = new Set(
      [...deletedPaths].map((entry) => entry.split("/")[3]),
    );
    const sourceLifecycleData = spawnSync(
      "git",
      [
        "-C",
        repository,
        "ls-tree",
        "-r",
        "--name-only",
        preservedCalculatorHead,
        "--",
        ".lifecycle/data",
      ],
      { encoding: "utf8" },
    );
    expect(
      sourceLifecycleData.status,
      `${sourceLifecycleData.stderr}${sourceLifecycleData.stdout}`,
    ).toBe(0);
    for (const sourcePath of sourceLifecycleData.stdout.trim().split("\n")) {
      const transactionId = sourcePath.split("/")[3];
      if (transactionId && deletedTransactions.has(transactionId)) {
        expect(deletedPaths, `partially retained transaction ${transactionId}`).toContain(
          sourcePath,
        );
      }
    }

    const reviewHistoryBefore = mdlm(
      repository,
      "history",
      "REV-C24FPGNFYH",
      "--json",
    );
    expect(reviewHistoryBefore.status).toBe(0);
    expect(JSON.parse(reviewHistoryBefore.stdout).history).toEqual({
      id: "REV-C24FPGNFYH",
      type: "REV",
      revisions: [
        expect.objectContaining({
          revisionId: "REV-C24FPGNFYH-r00001",
          processRef:
            "mdlm-bootstrap@0.65.0#sha256:585b32dad15327e6fc7822cc4ea08c42c14d63301a55b6659b7bfa63297a5c0e",
        }),
      ],
    });
    const dataBefore = await directoryDigest(
      path.join(repository, ".lifecycle/data"),
    );

    const targetReference = await stageProcessPackageFixture(
      repository,
      bootstrapPackage,
    );
    const migrated = mdlm(
      repository,
      "process",
      "migrate",
      targetReference,
      "--json",
    );
    expect(migrated.status, `${migrated.stderr}${migrated.stdout}`).toBe(0);
    expect(
      await directoryDigest(path.join(repository, ".lifecycle/data")),
    ).toBe(dataBefore);
    const reviewHistoryAfter = mdlm(
      repository,
      "history",
      "REV-C24FPGNFYH",
      "--json",
    );
    expect(reviewHistoryAfter.status).toBe(0);
    expect(JSON.parse(reviewHistoryAfter.stdout).history).toEqual(
      JSON.parse(reviewHistoryBefore.stdout).history,
    );
    const correctedInterfaceHistory = mdlm(
      repository,
      "history",
      "ICSP-JTJ9ZWD6MR",
      "--json",
    );
    expect(correctedInterfaceHistory.status).toBe(0);
    expect(
      JSON.parse(correctedInterfaceHistory.stdout).history.revisions,
    ).toContainEqual(
      expect.objectContaining({
        revisionId: "ICSP-JTJ9ZWD6MR-r00002",
        processRef:
          "mdlm-bootstrap@0.65.0#sha256:585b32dad15327e6fc7822cc4ea08c42c14d63301a55b6659b7bfa63297a5c0e",
      }),
    );
    const doctorAfter = mdlm(repository, "doctor", "--json");
    expect(
      doctorAfter.status,
      `${doctorAfter.stderr}${doctorAfter.stdout}`,
    ).toBe(0);
    expect(JSON.parse(doctorAfter.stdout)).toEqual(
      expect.objectContaining({
        ok: true,
        package: expect.objectContaining({
          reference: "mdlm-bootstrap@0.66.0",
        }),
        diagnostics: [],
      }),
    );
  }, 300_000);

  it("preserves and prepares an active 0.65.0 Assignment during migration", async () => {
    const previousRoot = await historicalBootstrap065Copy(parent);
    await selectProcessPackageFixture(repository, previousRoot);
    const next = mdlm(repository, "next", "--json");
    expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
    const assignment = JSON.parse(next.stdout).assignment.id as string;
    const leasePath = path.join(
      repository,
      ".lifecycle/work/active-assignment.json",
    );
    const leaseBefore = await fs.readFile(leasePath, "utf8");
    const dataBefore = await directoryDigest(
      path.join(repository, ".lifecycle/data"),
    );

    const targetReference = await stageProcessPackageFixture(
      repository,
      bootstrapPackage,
    );
    const migrated = mdlm(
      repository,
      "process",
      "migrate",
      targetReference,
      "--json",
    );
    expect(migrated.status, `${migrated.stderr}${migrated.stdout}`).toBe(0);
    expect(await fs.readFile(leasePath, "utf8")).toBe(leaseBefore);
    expect(
      await directoryDigest(path.join(repository, ".lifecycle/data")),
    ).toBe(dataBefore);

    const prepared = mdlm(
      repository,
      "scenario",
      "prepare",
      assignment,
      "--json",
    );
    expect(prepared.status, `${prepared.stderr}${prepared.stdout}`).toBe(0);
    expect(JSON.parse(prepared.stdout)).toEqual(
      expect.objectContaining({
        assignment: expect.objectContaining({ id: assignment }),
        package: expect.objectContaining({
          reference: "mdlm-bootstrap@0.66.0",
        }),
      }),
    );
    const doctor = mdlm(repository, "doctor", "--json");
    expect(doctor.status, `${doctor.stderr}${doctor.stdout}`).toBe(0);
  }, 120_000);

  it("preserves exhausted 0.65.0 malformed-response history during migration", async () => {
    const previousRoot = await historicalBootstrap065Copy(parent);
    await selectProcessPackageFixture(repository, previousRoot);
    const assignment = JSON.parse(mdlm(repository, "next").stdout).assignment
      .id as string;
    const dataBefore = await directoryDigest(
      path.join(repository, ".lifecycle/data"),
    );

    const first = mdlmWithInput(repository, "{}\n", "scenario", "submit");
    expect(first.status).toBe(1);
    expect(JSON.parse(first.stdout)).toEqual(
      expect.objectContaining({
      assignment: { id: assignment },
      disposition: "correction-required",
      malformedResponse: expect.objectContaining({
        attempt: 1,
        correctionsRemaining: 1,
      }),
      }),
    );
    const second = mdlmWithInput(repository, "{]\n", "scenario", "submit");
    expect(second.status).toBe(1);
    expect(JSON.parse(second.stdout)).toEqual(
      expect.objectContaining({
      assignment: { id: assignment },
      disposition: "exhausted",
      malformedResponse: expect.objectContaining({
        attempt: 2,
        correctionsRemaining: 0,
      }),
      }),
    );
    const leasePath = path.join(
      repository,
      ".lifecycle/work/active-assignment.json",
    );
    const exhaustedBefore = JSON.parse(await fs.readFile(leasePath, "utf8"));
    expect(exhaustedBefore).toEqual(
      expect.objectContaining({
      id: assignment,
      disposition: "exhausted",
      package: expect.objectContaining({
        reference: "mdlm-bootstrap@0.65.0",
        digest:
          "sha256:585b32dad15327e6fc7822cc4ea08c42c14d63301a55b6659b7bfa63297a5c0e",
      }),
      malformedResponses: [
          expect.objectContaining({
            digest: expect.stringMatching(/^sha256:/),
          }),
          expect.objectContaining({
            digest: expect.stringMatching(/^sha256:/),
          }),
      ],
      }),
    );

    const targetReference = await stageProcessPackageFixture(
      repository,
      bootstrapPackage,
    );
    const migrated = mdlm(
      repository,
      "process",
      "migrate",
      targetReference,
      "--json",
    );
    expect(migrated.status, `${migrated.stderr}${migrated.stdout}`).toBe(0);
    expect(
      await directoryDigest(path.join(repository, ".lifecycle/data")),
    ).toBe(dataBefore);
    const exhaustedAfter = JSON.parse(await fs.readFile(leasePath, "utf8"));
    expect(exhaustedAfter).toEqual(exhaustedBefore);
    expect(mdlm(repository, "doctor", "--json").status).toBe(0);

    const reevaluated = mdlm(repository, "next", "--json");
    expect(
      reevaluated.status,
      `${reevaluated.stderr}${reevaluated.stdout}`,
    ).toBe(0);
    const replacement = JSON.parse(reevaluated.stdout).assignment;
    expect(replacement.id).not.toBe(assignment);
    const prepared = mdlm(
      repository,
      "scenario",
      "prepare",
      replacement.id,
      "--json",
    );
    expect(prepared.status, `${prepared.stderr}${prepared.stdout}`).toBe(0);
    const preparedPacket = JSON.parse(prepared.stdout);
    expect(preparedPacket).toEqual(
      expect.objectContaining({
      assignment: expect.objectContaining({ id: replacement.id }),
      package: expect.objectContaining({
        reference: "mdlm-bootstrap@0.66.0",
      }),
      scenario: expect.objectContaining({
        reference: "establish-initial-wayfinding-map@1",
      }),
      }),
    );
    const published = mdlmWithInput(
      repository,
      `${JSON.stringify({
        contract: "mdlm-assignment-response@1",
        assignment: replacement.id,
        kind: "proposal",
        proposal: {
          outputs: [
            {
              localId: "map",
              name: "map",
              invocation: 0,
              lifecycleDatum: {
                type: "MAP",
                payload: {
                  title: "Post-migration canonical publication",
                  purpose: "Prove fresh work remains publishable.",
                  frontier: ["Continue from preserved exact history"],
                },
                links: [],
                body: "Published only after exact 0.65.0 history migrated.\n",
              },
            },
          ],
          completionEvidence: {
            summary: "Published fresh canonical work after migration.",
          },
          loadedSkillRefs: preparedPacket.prompt.skills.map(
            (skill: { reference: string }) => skill.reference,
          ),
          authoritySupplies: [],
          standingDelegations: [],
        },
      })}\n`,
      "scenario",
      "submit",
    );
    expect(published.status, `${published.stderr}${published.stdout}`).toBe(0);
    expect(JSON.parse(published.stdout)).toEqual(
      expect.objectContaining({
      ok: true,
      execution: expect.objectContaining({ status: "completed" }),
      }),
    );
    expect(mdlm(repository, "doctor", "--json").status).toBe(0);
  }, 120_000);

  it("rejects an incompatible package without changing exact contract bytes", async () => {
    const previousRoot = await packageCopy(parent, "previous", "0.40.0");
    const incompatibleRoot = await packageCopy(
      parent,
      "incompatible",
      "0.58.0",
    );
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
    expect(JSON.parse(migrated.stdout).diagnostics).toEqual(
      expect.arrayContaining([
      expect.objectContaining({ code: "meta-schema" }),
      ]),
    );
    expect(await contractBytes(repository)).toBe(before);
  }, 30_000);
});

import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const executable = path.join(process.cwd(), "dist/mdlm.js");

function mdlm(repository: string, arguments_: string[], input?: string) {
  return spawnSync(process.execPath, [executable, ...arguments_], {
    cwd: repository,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    timeout: 10_000,
    ...(input === undefined ? {} : { input }),
  });
}

function git(repository: string, ...arguments_: string[]) {
  return spawnSync("git", ["-C", repository, ...arguments_], {
    encoding: "utf8",
    timeout: 10_000,
  });
}

describe("clean onboarding transaction contract", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true })
    ));
  });

  it("publishes the first transaction and binds later work to the committed state", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-zero-to-assessment-"));
    roots.push(root);
    const repository = path.join(root, "repository");

    const initialized = mdlm(root, ["init", repository, "--json"]);
    expect(initialized.status, `${initialized.stderr}${initialized.stdout}`).toBe(0);
    expect(JSON.parse(initialized.stdout)).toMatchObject({
      package: {
        reference: "mdlm-bootstrap@0.70.0",
        digest:
          "sha256:bfc2bee8ba30b32fbfdd2cebcf2ba7840c51b3b4fb0d9e894b22b0abc5353cf1",
      },
      repository: { contract: "mdlm-repository@1" },
    });
    expect(git(repository, "status", "--porcelain").stdout).toBe("");

    const first = mdlm(repository, ["next"]);
    expect(first.status, `${first.stderr}${first.stdout}`).toBe(0);
    const firstOutcome = JSON.parse(first.stdout);
    expect(firstOutcome).toMatchObject({
      contract: "mdlm-next@1",
      outcome: "assignment",
      assignment: { id: expect.any(String) },
    });

    const prepared = mdlm(repository, [
      "scenario",
      "prepare",
      firstOutcome.assignment.id,
    ]);
    expect(prepared.status, `${prepared.stderr}${prepared.stdout}`).toBe(0);
    const packet = JSON.parse(prepared.stdout);
    expect(packet).toMatchObject({
      contract: "mdlm-assignment-packet@2",
      package: {
        reference: "mdlm-bootstrap@0.70.0",
        digest:
          "sha256:bfc2bee8ba30b32fbfdd2cebcf2ba7840c51b3b4fb0d9e894b22b0abc5353cf1",
      },
      scenario: { reference: "establish-initial-wayfinding-map@1" },
    });

    const response = {
      contract: "mdlm-assignment-response@1",
      assignment: firstOutcome.assignment.id,
      kind: "proposal",
      proposal: {
        outputs: [{
          localId: "map",
          name: "map",
          invocation: 0,
          lifecycleDatum: {
            type: "MAP",
            payload: {
              title: "Zero-to-assessment clean pilot",
              purpose: "Prove autonomous onboarding through the public process.",
              frontier: ["Define the smallest sufficient product intent"],
            },
            links: [],
            body: "One bounded Product Wayfinding frontier.\n",
          },
        }],
        completionEvidence: { summary: "Established the exact pilot frontier." },
        loadedSkillRefs: packet.prompt.skills.map(
          (skill: { reference: string }) => skill.reference,
        ),
        authoritySupplies: [],
        standingDelegations: [],
      },
    };
    const submitted = mdlm(
      repository,
      ["scenario", "submit"],
      `${JSON.stringify(response)}\n`,
    );
    expect(submitted.status, `${submitted.stderr}${submitted.stdout}`).toBe(0);

    const doctor = mdlm(repository, ["doctor", "--json"]);
    expect(doctor.status, `${doctor.stderr}${doctor.stdout}`).toBe(0);
    expect(git(repository, "add", "-N", ".lifecycle/data").status).toBe(0);
    expect(git(repository, "diff", "--quiet", "--", ".lifecycle/data").status).toBe(1);
    expect(git(repository, "add", ".lifecycle/data").status).toBe(0);
    const committed = git(
      repository,
      "-c", "user.name=MDLM Pilot",
      "-c", "user.email=mdlm-pilot@example.invalid",
      "-c", "commit.gpgSign=false",
      "commit", "--quiet", "--no-verify", "-m", "Publish clean pilot MAP",
    );
    expect(committed.status, `${committed.stderr}${committed.stdout}`).toBe(0);
    expect(git(repository, "status", "--porcelain").stdout).toBe("");

    const subsequent = mdlm(repository, ["next"]);
    expect(subsequent.status, `${subsequent.stderr}${subsequent.stdout}`).toBe(0);
    const subsequentOutcome = JSON.parse(subsequent.stdout);
    expect(subsequentOutcome.outcome).toBe("assignment");
    const subsequentPacket = mdlm(repository, [
      "scenario",
      "prepare",
      subsequentOutcome.assignment.id,
    ]);
    expect(
      subsequentPacket.status,
      `${subsequentPacket.stderr}${subsequentPacket.stdout}`,
    ).toBe(0);

    // This is not pilot progress. It proves that an allocated Assignment cannot
    // silently cross a tracked-state boundary after the clean commit.
    await fs.appendFile(path.join(repository, ".gitignore"), "# tracked drift\n");
    const stale = mdlm(repository, [
      "scenario",
      "prepare",
      subsequentOutcome.assignment.id,
    ]);
    expect(stale.status).toBe(1);
    expect(JSON.parse(stale.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "assignment-stale" }),
    ]);
  }, 30_000);
});

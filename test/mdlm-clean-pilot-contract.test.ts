import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const executable = path.join(process.cwd(), "dist/mdlm.js");

function mdlm(repository: string, args: string[], input?: string) {
  return spawnSync(process.execPath, [executable, ...args], {
    cwd: repository,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    ...(input === undefined ? {} : { input }),
  });
}

function git(repository: string, ...args: string[]) {
  return spawnSync("git", ["-C", repository, ...args], { encoding: "utf8" });
}

describe("clean pilot public-process contract", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true })
    ));
  });

  it("binds each subsequent Assignment to the doctor-checked ordinary Git commit", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-clean-pilot-"));
    roots.push(root);
    const repository = path.join(root, "repository");
    const initialized = mdlm(root, ["init", repository, "--json"]);
    expect(initialized.status, `${initialized.stderr}${initialized.stdout}`).toBe(0);
    expect(git(repository, "status", "--porcelain").stdout).toBe("");

    const next = mdlm(repository, ["next"]);
    expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
    const outcome = JSON.parse(next.stdout);
    expect(outcome.outcome).toBe("assignment");

    const prepared = mdlm(repository, ["scenario", "prepare", outcome.assignment.id]);
    expect(prepared.status, `${prepared.stderr}${prepared.stdout}`).toBe(0);
    const packet = JSON.parse(prepared.stdout);
    expect(packet.scenario.reference).toBe("establish-initial-wayfinding-map@1");

    const response = {
      contract: "mdlm-assignment-response@1",
      assignment: outcome.assignment.id,
      kind: "proposal",
      proposal: {
        outputs: [{
          localId: "map",
          name: "map",
          invocation: 0,
          lifecycleDatum: {
            type: "MAP",
            payload: {
              title: "Complete-profile clean pilot",
              purpose: "Prove the public operator loop against exact committed state.",
              frontier: ["Define the smallest sufficient product intent"],
            },
            links: [],
            body: "The pilot begins from one bounded Product Wayfinding frontier.\n",
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

    expect(git(repository, "rev-parse", "HEAD").stdout.trim()).toMatch(/^[0-9a-f]{40}$/);
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

    // This adversarial edit is not pilot progress. It proves through the public
    // interface that the allocated Assignment is exact to the clean commit.
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

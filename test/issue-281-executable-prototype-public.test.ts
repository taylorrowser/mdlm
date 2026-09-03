import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { expect, it } from "vitest";
import { mdlm, mdlmWithInput } from "./helpers/mdlm.js";

interface RepositoryEntry {
  path: string;
  source: string;
}

it("rejects non-executable inline prototype controls before publication", async () => {
  const repository = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-issue-281-"));
  try {
    const archive = await fs.readFile(path.join(
      process.cwd(),
      "test/fixtures/issue-281-pilot-target-ready/repository.json.gz",
    ));
    expect(createHash("sha256").update(archive).digest("hex")).toBe(
      "025d0f061ed1787eddb29502eaa6dcf08da76287ca7f4b9a925c4808f4166415",
    );
    const entries = JSON.parse(gunzipSync(archive).toString("utf8")) as RepositoryEntry[];
    for (const entry of entries) {
      const destination = path.join(repository, entry.path);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, entry.source);
    }

    expect(spawnSync("git", ["init", "--quiet", repository]).status).toBe(0);
    expect(spawnSync("git", ["-C", repository, "add", ".lifecycle"]).status).toBe(0);
    expect(spawnSync("git", ["-C", repository, "-c", "user.name=MDLM Test", "-c", "user.email=mdlm-test@localhost", "-c", "commit.gpgSign=false", "commit", "--quiet", "--no-verify", "-m", "Install pilot target checkpoint"]).status).toBe(0);

    const next = mdlm(repository, "next", "--json");
    expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
    const packet = JSON.parse(next.stdout).assignment.packet;
    expect(packet.scenario.reference).toBe(
      "build-representative-level-pilot-control-prototype@1",
    );
    const activity = packet.exactInputs[0].inputs.find(
      (input: { name: string }) => input.name === "activity",
    ).values[0].identity.revision_id;
    const response = structuredClone(packet.responseScaffold);
    response.proposal.outputs[0].payload = {
      title: "Non-executable classification controls",
      kind: "prototype",
      supported_behavior: ["valid classification"],
      unsupported_behavior: ["invalid classification"],
      prototype_controls: {
        activity_ref: activity,
        working_directory: "fresh-temporary-directory",
        known_good: {
          argv: ["control", "good"],
          expected_observation: {
            exit_status: 0,
            stdout: { encoding: "base64", bytes: "" },
            stderr: { encoding: "base64", bytes: "" },
          },
          expected_verification_outcome: "pass",
        },
        known_bad: {
          argv: ["control", "bad"],
          expected_observation: {
            exit_status: 2,
            stdout: { encoding: "base64", bytes: "" },
            stderr: { encoding: "base64", bytes: "" },
          },
          expected_verification_outcome: "fail",
          fault: "Wrong exit status",
        },
      },
    };
    response.proposal.outputs[0].body = "Commands that do not exist cannot become pilot controls.\n";
    response.proposal.completionEvidence = { summary: "Attempted the exact Codex238 payload shape." };
    const transactions = path.join(repository, ".lifecycle/data/.transactions");
    const before = (await fs.readdir(transactions)).length;

    const submitted = mdlmWithInput(
      repository,
      `${JSON.stringify(response)}\n`,
      "scenario",
      "submit",
      "-",
      "--json",
    );
    expect(submitted.status).toBe(1);
    expect(JSON.parse(submitted.stdout)).toEqual(expect.objectContaining({
      outcome: "rejected",
      retryable: true,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: "datum-payload",
          path: "proposal.outputs[0].payload/prototype_controls/known_good/argv/0",
        }),
        expect.objectContaining({
          code: "datum-payload",
          path: "proposal.outputs[0].payload/prototype_controls/known_bad/argv/0",
        }),
      ]),
    }));
    expect((await fs.readdir(transactions)).length).toBe(before);
  } finally {
    await fs.rm(repository, { recursive: true, force: true });
  }
}, 30_000);

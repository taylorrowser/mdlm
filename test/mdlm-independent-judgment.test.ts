import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  copiedProcessPackage,
  suppressPhase0FoundationObligations,
} from "./helpers/process-package.js";
import { req } from "./helpers/req.js";

const mdlmExecutable = path.join(process.cwd(), "dist/mdlm.js");

function mdlm(repository: string, input: string | undefined, ...arguments_: string[]) {
  return spawnSync(process.execPath, [mdlmExecutable, ...arguments_], {
    cwd: repository,
    encoding: "utf8",
    ...(input === undefined ? {} : { input }),
    maxBuffer: 10 * 1024 * 1024,
  });
}

function git(repository: string, ...arguments_: string[]) {
  return spawnSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" });
}

describe("independent Assignment judgment publication", () => {
  let parent: string;
  let repository: string;

  beforeEach(async () => {
    parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-independent-judgment-"));
    repository = path.join(parent, "repository");
    await fs.mkdir(repository);
    const processRoot = await copiedProcessPackage("mdlm-independent-judgment-process-");
    await suppressPhase0FoundationObligations(processRoot);
    const initialized = req(repository, "init", "--process", processRoot, "--json");
    expect(initialized.status, `${initialized.stderr}${initialized.stdout}`).toBe(0);
    await fs.rm(path.dirname(processRoot), { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.rm(parent, { recursive: true, force: true });
  });

  it("publishes a contract-valid unfavorable independent judgment unchanged", async () => {
    const created = req(
      repository,
      "new",
      "PSP",
      "--scenario",
      "compile-psp@2",
      "--set",
      "title=Independent-review publication tracer",
      "--set",
      "rationale=Reach one exact delegated Review Assignment",
      "--set",
      "problem=Unfavorable independent judgments must publish unchanged",
      "--set",
      'users=["MDLM operator"]',
      "--set",
      'goals=["preserve exact independent judgment"]',
      "--set",
      "non_goals=[]",
      "--set",
      'success_measures=["one failed Review publishes exactly"]',
      "--json",
    );
    expect(created.status, `${created.stderr}${created.stdout}`).toBe(0);
    const subject = JSON.parse(created.stdout).created as {
      revisionId: string;
    };
    const contextCreated = req(
      repository,
      "baseline",
      "create",
      "--type",
      "BSL",
      "--scenario",
      "create-review-context@1",
      "--set",
      "title=Independent Review context",
      "--set",
      "kind=review-context",
      "--set",
      "role=review-context",
      "--set",
      `scope=${subject.revisionId}`,
      "--set",
      "group=phase-0-wayfinding",
      "--json",
    );
    expect(contextCreated.status, contextCreated.stderr).toBe(0);
    const context = JSON.parse(contextCreated.stdout).created as {
      id: string;
      revisionId: string;
    };
    expect(req(
      repository,
      "baseline",
      "add",
      context.id,
      subject.revisionId,
      "--json",
    ).status).toBe(0);
    expect(req(repository, "baseline", "freeze", context.id, "--json").status).toBe(0);

    expect(git(repository, "init").status).toBe(0);
    expect(git(repository, "add", ".").status).toBe(0);
    expect(git(
      repository,
      "-c",
      "user.name=MDLM Test",
      "-c",
      "user.email=mdlm-test@example.invalid",
      "commit",
      "-m",
      "Prepare independent Review",
    ).status).toBe(0);

    const next = mdlm(repository, undefined, "next");
    expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
    const assignment = JSON.parse(next.stdout).assignment.id as string;
    const prepared = mdlm(repository, undefined, "scenario", "prepare", assignment);
    expect(prepared.status, `${prepared.stderr}${prepared.stdout}`).toBe(0);
    const packet = JSON.parse(prepared.stdout);
    expect(packet.scenario.reference).toBe("review-datum-in-context@2");
    expect(packet.authority.requirements).toEqual([
      expect.objectContaining({
        authorityRequirement: expect.objectContaining({
          mode: "delegated",
          authority: "independent-reviewer",
        }),
      }),
    ]);

    const finding = {
      id: "F-001",
      target: subject.revisionId,
      relationship: "primary",
      severity: "blocking",
      summary: "The exact product outcome remains insufficiently bounded.",
    };
    const response = {
      contract: "mdlm-assignment-response@1",
      assignment,
      kind: "proposal",
      proposal: {
        outputs: [{
          localId: "review",
          name: "review",
          invocation: 0,
          lifecycleDatum: {
            type: "REV",
            payload: {
              title: "Independent product Review",
              review_kind: "contextual",
              rubric_ref: "policies/rubrics/contextual-review.md@1",
              findings: [finding],
              outcome: "fail",
            },
            links: [
              { type: "reviews", target: subject.revisionId },
              { type: "contextualizes", target: context.revisionId },
            ],
            body: "The exact independent judgment is unfavorable.\n",
          },
        }],
        completionEvidence: { summary: "Independent Review completed." },
        loadedSkillRefs: packet.prompt.skills.map(
          (skill: { reference: string }) => skill.reference,
        ),
        authoritySupplies: ["independent-reviewer"],
        standingDelegations: [],
      },
    };
    const submitted = mdlm(
      repository,
      `${JSON.stringify(response)}\n`,
      "scenario",
      "submit",
    );
    expect(submitted.status, `${submitted.stderr}${submitted.stdout}`).toBe(0);
    const execution = JSON.parse(submitted.stdout).execution;
    expect(execution.authority.supplied).toEqual(["independent-reviewer"]);
    expect(execution.authority.requirements).toEqual([
      expect.objectContaining({
        authorization: {
          kind: "authority-supply",
          authority: "independent-reviewer",
        },
      }),
    ]);
    expect(execution.outputs[0].data.payload).toEqual(expect.objectContaining({
      outcome: "fail",
      findings: [finding],
    }));
    expect(mdlm(repository, undefined, "doctor", "--json").status).toBe(0);

    const executionPath = path.join(
      repository,
      ".lifecycle/data/.transactions",
      execution.id,
      "execution.json",
    );
    const falsifiedExecution = JSON.parse(await fs.readFile(executionPath, "utf8"));
    falsifiedExecution.authority.supplied = [];
    await fs.writeFile(executionPath, `${JSON.stringify(falsifiedExecution, null, 2)}\n`);
    const falsifiedDoctor = mdlm(repository, undefined, "doctor", "--json");
    expect(falsifiedDoctor.status).toBe(1);
    expect(JSON.parse(falsifiedDoctor.stdout).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "authority-evidence-execution-required" }),
      ]),
    );
  }, 30_000);
});

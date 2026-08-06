import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { participationProcessPackage } from "./helpers/participation-process.js";
import { req } from "./helpers/req.js";

interface LooseEnd {
  id: string;
  subject: string;
  obligation: string;
  participation: unknown[];
}

describe("Scenario participation projections", () => {
  let processRoot: string;
  let repositoryRoot: string;

  beforeEach(async () => {
    processRoot = await participationProcessPackage();
    repositoryRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "mdlm-participation-repository-"),
    );
    const initialized = req(
      repositoryRoot,
      "init",
      "--process",
      processRoot,
      "--json",
    );
    expect(initialized.status, initialized.stderr).toBe(0);
  });

  afterEach(async () => {
    await Promise.all([
      fs.rm(path.dirname(processRoot), { recursive: true, force: true }),
      fs.rm(repositoryRoot, { recursive: true, force: true }),
    ]);
  });

  function createQuestion(
    title: string,
    kind: "empirical" | "preferential",
    owner?: string,
    blockedTarget?: string,
  ): string {
    const result = req(
      repositoryRoot,
      "new",
      "QST",
      "--scenario",
      "compile-psp@1",
      "--set",
      `title=${title}`,
      "--set",
      `kind=${kind}`,
      ...(kind === "empirical"
        ? ["--set", "evidence_available=true"]
        : []),
      "--set",
      `question=${title}?`,
      "--set",
      "state=open",
      "--set",
      "blocking_impact=The package determines when authority is required.",
      ...(owner ? ["--set", `owner=${owner}`] : []),
      ...(blockedTarget ? ["--link", `blocks=${blockedTarget}`] : []),
      "--body",
      `${title}.`,
      "--json",
    );
    expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);
    return JSON.parse(result.stdout).created.revisionId;
  }

  it("projects participation for an explicitly initiated Scenario", async () => {
    const dryRun = req(
      repositoryRoot,
      "scenario",
      "dry-run",
      "chart-wayfinding-map@1",
      "--initiate",
      "--json",
    );

    expect(dryRun.status, `${dryRun.stderr}\n${dryRun.stdout}`).toBe(0);
    const participation = [{
      policy: "process-participation@1",
      authorityRequirement: {
        mode: "autonomous",
        authority: "process-authority",
        delegationAllowed: false,
      },
      attentionSchedule: {
        timing: "none",
        checkpoint: null,
        consolidationGroup: null,
      },
      transactionBatching: "single",
    }];
    expect(JSON.parse(dryRun.stdout).scenarioDryRun.participation).toEqual(
      participation,
    );

    const requestPath = path.join(repositoryRoot, "adapter-request.json");
    const adapterPath = path.join(repositoryRoot, "adapter.mjs");
    const response = {
      outputs: [{
        name: "map",
        invocation: 0,
        lifecycleDatum: {
          id: "MAP-0123456789",
          type: "MAP",
          payload: {
            title: "Participation map",
            purpose: "Preserve participation in execution.",
            frontier: ["Continue declaratively."],
          },
          links: [],
          body: "Participation map.\n",
        },
      }],
      completionEvidence: { summary: "Participation remained exact." },
    };
    await fs.writeFile(
      adapterPath,
      `#!/usr/bin/env node
import fs from "node:fs";
let input = "";
process.stdin.on("data", chunk => input += chunk);
process.stdin.on("end", () => {
  fs.writeFileSync(${JSON.stringify(requestPath)}, input);
  process.stdout.write(${JSON.stringify(JSON.stringify(response))});
});
`,
      { mode: 0o755 },
    );
    const executed = req(
      repositoryRoot,
      "scenario",
      "execute",
      "chart-wayfinding-map@1",
      "--initiate",
      "--adapter",
      adapterPath,
      "--json",
    );
    expect(executed.status, `${executed.stderr}\n${executed.stdout}`).toBe(0);
    const adapterRequest = JSON.parse(await fs.readFile(requestPath, "utf8"));
    expect(adapterRequest.contract).toBe("mdlm-agent-adapter@2");
    expect(adapterRequest.participation).toEqual(participation);
    const execution = JSON.parse(executed.stdout).execution;
    expect(execution.contract).toBe("mdlm-scenario-execution@2");
    expect(execution.adapter.contract).toBe("mdlm-agent-adapter@2");
    expect(execution.participation).toEqual(participation);
    expect(execution.policies).toEqual(expect.arrayContaining([
      {
        role: "participation",
        reference: "process-participation@1",
      },
    ]));
    const shown = req(
      repositoryRoot,
      "scenario",
      "execution",
      "show",
      execution.id,
    );
    expect(shown.status, shown.stderr).toBe(0);
    expect(shown.stdout).toContain(
      "Authority: autonomous (process-authority)",
    );
  }, 15_000);

  it("projects autonomous, delegated, immediate, and checkpoint participation consistently", () => {
    const target = req(
      repositoryRoot,
      "new",
      "PSP",
      "--scenario",
      "compile-psp@1",
      "--set",
      "title=Participation target",
      "--set",
      "rationale=Give a blocking question an exact target",
      "--set",
      "problem=Authority timing must remain declarative.",
      "--set",
      'users=["operator"]',
      "--set",
      'goals=["project participation"]',
      "--set",
      "non_goals=[]",
      "--set",
      'success_measures=["all modes are public"]',
      "--body",
      "Participation target.",
      "--json",
    );
    expect(target.status, target.stderr).toBe(0);
    const targetId = JSON.parse(target.stdout).created.id;

    const expectedBySubject = new Map<string, Record<string, unknown>>([
      [
        createQuestion("Empirical evidence", "empirical"),
        {
          authorityRequirement: {
            mode: "autonomous",
            authority: "evidence-authority",
            delegationAllowed: false,
          },
          attentionSchedule: {
            timing: "none",
            checkpoint: null,
            consolidationGroup: null,
          },
        },
      ],
      [
        createQuestion(
          "Independent analysis",
          "empirical",
          "independent-reviewer",
        ),
        {
          authorityRequirement: {
            mode: "delegated",
            authority: "independent-reviewer",
            delegationAllowed: true,
          },
          attentionSchedule: {
            timing: "none",
            checkpoint: null,
            consolidationGroup: null,
          },
        },
      ],
      [
        createQuestion("Blocking preference", "preferential", undefined, targetId),
        {
          authorityRequirement: {
            mode: "attended",
            authority: "stakeholder",
            delegationAllowed: false,
          },
          attentionSchedule: {
            timing: "immediate",
            checkpoint: null,
            consolidationGroup: null,
          },
        },
      ],
      [
        createQuestion("Nonblocking preference", "preferential"),
        {
          authorityRequirement: {
            mode: "attended",
            authority: "stakeholder",
            delegationAllowed: false,
          },
          attentionSchedule: {
            timing: "checkpoint",
            checkpoint: "phase-0-gate",
            consolidationGroup: "phase-0-stakeholder-questions",
          },
        },
      ],
    ]);

    const looseResult = req(
      repositoryRoot,
      "loose-ends",
      "--phase",
      "phase-0-wayfinding",
      "--json",
    );
    expect(
      looseResult.status,
      `${looseResult.stderr}\n${looseResult.stdout}`,
    ).toBe(0);
    const looseEnds = (JSON.parse(looseResult.stdout).looseEnds.items as LooseEnd[])
      .filter((item) => item.obligation === "open-question-resolution");
    expect(looseEnds).toHaveLength(4);
    const humanLooseEnds = req(
      repositoryRoot,
      "loose-ends",
      "--phase",
      "phase-0-wayfinding",
    );
    expect(humanLooseEnds.status, humanLooseEnds.stderr).toBe(0);
    expect(humanLooseEnds.stdout).toContain(
      "Authority: attended (stakeholder)",
    );
    expect(humanLooseEnds.stdout).toContain(
      "Consolidation Group: phase-0-stakeholder-questions",
    );
    expect(humanLooseEnds.stdout).toContain("Transaction Batching: single");

    for (const item of looseEnds) {
      const expected = expectedBySubject.get(item.subject);
      expect(expected).toBeDefined();
      expect(item.participation).toEqual([{
        policy: "question-participation@1",
        ...expected,
        transactionBatching: "single",
      }]);
      const dryRunResult = req(
        repositoryRoot,
        "scenario",
        "dry-run",
        "resolve-question@1",
        "--obligation",
        item.id,
        "--json",
      );
      expect(
        dryRunResult.status,
        `${dryRunResult.stderr}\n${dryRunResult.stdout}`,
      ).toBe(0);
      expect(JSON.parse(dryRunResult.stdout).scenarioDryRun.participation)
        .toEqual(item.participation);
    }

    const nextResult = req(
      repositoryRoot,
      "next",
      "--phase",
      "phase-0-wayfinding",
      "--json",
    );
    expect(nextResult.status, nextResult.stderr).toBe(0);
    const nextItem = JSON.parse(nextResult.stdout).next.item as LooseEnd;
    expect(nextItem.participation).toEqual(
      looseEnds.find((item) => item.id === nextItem.id)?.participation,
    );
  }, 20_000);
});

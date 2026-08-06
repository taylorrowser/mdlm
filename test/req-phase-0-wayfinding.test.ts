import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { req } from "./helpers/req.js";

const examplePackage = path.join(process.cwd(), ".lifecycle/process");

describe("req Phase 0 wayfinding slice", () => {
  let repositoryRoot: string;

  beforeEach(async () => {
    repositoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-phase-0-"));
    const initialized = req(
      repositoryRoot,
      "init",
      "--process",
      examplePackage,
      "--json",
    );
    expect(initialized.status, initialized.stderr).toBe(0);
  });

  afterEach(async () => {
    await fs.rm(repositoryRoot, { recursive: true, force: true });
  });

  it("supplies the lifecycle definitions needed for a small intent slice", () => {
    const shown = req(repositoryRoot, "process", "show", "--json");

    expect(shown.status, shown.stderr).toBe(0);
    const catalogs = JSON.parse(shown.stdout).inspection.definitionCatalogs;
    expect(catalogs.types).toEqual([
      "ART@1",
      "ASP@1",
      "BSL@2",
      "CHG@1",
      "DEC@2",
      "DWP@1",
      "ENV@1",
      "ICSP@1",
      "MAP@1",
      "PAS@1",
      "PRB@1",
      "PSP@2",
      "QST@3",
      "RES@1",
      "REV@2",
      "RUN@1",
      "STK@2",
      "SYS@2",
      "VAI@1",
      "VER@1",
      "VSP@1",
    ]);
    expect(catalogs.scenarios).toEqual(expect.arrayContaining([
      "build-exploratory-prototype@1",
      "chart-wayfinding-map@1",
      "record-gate-signoff@1",
      "review-datum-in-context@1",
    ]));
  });

  it("rejects a mutable prototype repository reference", () => {
    const created = req(
      repositoryRoot,
      "new",
      "ART",
      "--scenario",
      "build-exploratory-prototype@1",
      "--set",
      "title=Mutable prototype pointer",
      "--set",
      "kind=prototype",
      "--set",
      "repository_ref=git:main",
      "--set",
      'supported_behavior=["one experiment"]',
      "--set",
      "unsupported_behavior=[]",
      "--json",
    );

    expect(created.status).toBe(1);
    expect(JSON.parse(created.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "datum-payload" }),
    ]);
  });

  it("moves one exact intent slice through contextual review and reviewed gate sign-off", async () => {
    let adapterSequence = 0;
    const create = (...arguments_: string[]) => {
      const result = req(repositoryRoot, "new", ...arguments_, "--json");
      expect(result.status, result.stderr).toBe(0);
      return JSON.parse(result.stdout).created as {
        id: string;
        revisionId: string;
      };
    };
    const baseline = (title: string, kind: string, role: string, scenario: string) => {
      const result = req(
        repositoryRoot,
        "baseline",
        "create",
        "--type",
        "BSL",
        "--scenario",
        scenario,
        "--set",
        `title=${title}`,
        "--set",
        `kind=${kind}`,
        "--set",
        `role=${role}`,
        "--set",
        `scope=${title}`,
        "--set",
        "group=DEFAULT",
        "--json",
      );
      expect(result.status, result.stderr).toBe(0);
      return JSON.parse(result.stdout).created as {
        id: string;
        revisionId: string;
      };
    };
    const addAndFreeze = (
      created: { id: string; revisionId: string },
      members: string[],
      evidence: string[] = [],
    ) => {
      for (const member of members) {
        const added = req(
          repositoryRoot,
          "baseline",
          "add",
          created.id,
          member,
          "--json",
        );
        expect(added.status, added.stderr).toBe(0);
      }
      for (const item of evidence) {
        const added = req(
          repositoryRoot,
          "baseline",
          "evidence",
          "add",
          created.id,
          item,
          "--json",
        );
        expect(added.status, added.stderr).toBe(0);
      }
      const frozen = req(
        repositoryRoot,
        "baseline",
        "freeze",
        created.id,
        "--json",
      );
      expect(frozen.status, frozen.stderr).toBe(0);
      return created;
    };
    const looseEnds = () => {
      const result = req(
        repositoryRoot,
        "loose-ends",
        "--phase",
        "phase-0-wayfinding",
        "--json",
      );
      expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
      return JSON.parse(result.stdout).looseEnds.items as any[];
    };
    const looseEnd = (obligation: string, subject: string) => {
      const item = looseEnds().find((candidate) =>
        candidate.obligation === obligation.split("@")[0] && candidate.subject === subject
      );
      expect(item).toBeDefined();
      return item as any;
    };
    const adapter = async (response: unknown, label: string) => {
      adapterSequence += 1;
      const executable = path.join(
        repositoryRoot,
        `${String(adapterSequence).padStart(2, "0")}-${label}.mjs`,
      );
      const capture = `${executable}.request.json`;
      await fs.writeFile(
        executable,
        `#!/usr/bin/env node\nimport fs from "node:fs";\nconst input = fs.readFileSync(0, "utf8");\nfs.writeFileSync(${JSON.stringify(capture)}, input);\nprocess.stdout.write(${JSON.stringify(JSON.stringify(response))});\n`,
        { mode: 0o755 },
      );
      return { executable, capture };
    };
    const review = async (subject: string, context: string) => {
      const obligation = looseEnd("passing-review-required@2", subject);
      expect(obligation).toEqual(expect.objectContaining({
        status: "awaiting-review",
        dispatchable: true,
        actionableResolver: "review-datum-in-context@1",
      }));
      const configured = await adapter({
        outputs: [{
          name: "review",
          invocation: 0,
          lifecycleDatum: {
            type: "REV",
            payload: {
              title: `Independent review of ${subject}`,
              rubric_ref: "policies/rubrics/bootstrap-review.md@1",
              findings: [],
              outcome: "pass",
            },
            links: [
              { type: "reviews", target: subject },
              { type: "contextualizes", target: context },
            ],
            body: `The exact subject ${subject} passes in ${context}.\n`,
          },
        }],
        completionEvidence: { summary: "Independent contextual review passed." },
      }, "review");
      const executed = req(
        repositoryRoot,
        "scenario",
        "execute",
        "review-datum-in-context@1",
        "--obligation",
        obligation.id,
        "--adapter",
        configured.executable,
        "--input",
        `subject=${subject}`,
        "--input",
        `review_context=${context}`,
        "--json",
      );
      expect(executed.status, executed.stderr).toBe(0);
      return JSON.parse(executed.stdout).execution.outputs[0].lifecycleDatum
        .revisionId as string;
    };

    const question = create(
      "QST",
      "--scenario",
      "chart-wayfinding-map@1",
      "--set",
      "title=Can a narrow export prove the interaction?",
      "--set",
      "kind=empirical",
      "--set",
      "question=Can one representative export prove the interaction?",
      "--set",
      "state=answered",
      "--set",
      "blocking_impact=The export interaction remains uncertain",
    );
    const prototype = create(
      "ART",
      "--scenario",
      "build-exploratory-prototype@1",
      "--set",
      "title=Export interaction spike",
      "--set",
      "kind=prototype",
      "--set",
      "repository_ref=git:0123456789abcdef0123456789abcdef01234567",
      "--set",
      'supported_behavior=["export one representative report"]',
      "--set",
      'unsupported_behavior=["production persistence"]',
      "--link",
      `derived-from=${question.revisionId}`,
    );
    const decision = create(
      "DEC",
      "--scenario",
      "build-exploratory-prototype@1",
      "--set",
      "title=Use the narrow export interaction",
      "--set",
      "rationale=The exact prototype answered the empirical question",
      "--set",
      "kind=decision",
      "--set",
      "decision=Keep one representative export in the product intent",
      "--set",
      'alternatives=["Defer all export behavior"]',
      "--set",
      "effective_scope=Phase 0 intent slice",
      "--link",
      `resolves=${question.revisionId}`,
    );
    const product = create(
      "PSP",
      "--scenario",
      "compile-psp@1",
      "--set",
      "title=Representative report export",
      "--set",
      "rationale=A narrow export answers the observed user need",
      "--set",
      "problem=Users cannot carry one completed report into another tool",
      "--set",
      'users=["report author"]',
      "--set",
      'goals=["export one representative completed report"]',
      "--set",
      'non_goals=["general integration platform"]',
      "--set",
      'success_measures=["one report exports with its visible content"]',
    );
    const stakeholder = create(
      "STK",
      "--scenario",
      "draft-stakeholder-requirements@1",
      "--set",
      "title=Export a completed report",
      "--set",
      "rationale=Report authors need portable outcomes",
      "--set",
      "statement=The product shall export one completed report with its visible content.",
      "--set",
      "verification_intent=Export a representative completed report.",
      "--set",
      "stakeholder=report author",
      "--set",
      "priority=must",
      "--link",
      `derived-from=${product.id}`,
    );
    const map = create(
      "MAP",
      "--scenario",
      "chart-wayfinding-map@1",
      "--set",
      "title=Representative export frontier",
      "--set",
      "purpose=Decide the smallest useful report export",
      "--set",
      'frontier=["review exact product intent"]',
      "--link",
      `indexes=${question.id}`,
      "--link",
      `indexes=${decision.id}`,
      "--link",
      `indexes=${prototype.id}`,
      "--link",
      `indexes=${product.id}`,
      "--link",
      `indexes=${stakeholder.id}`,
    );

    await fs.rm(path.join(repositoryRoot, ".lifecycle/generated"), {
      recursive: true,
      force: true,
    });
    const beforeContext = looseEnds();
    const firstBlockedReview = beforeContext.findIndex((item) =>
      item.obligation === "passing-review-required"
    );
    const readyContexts = beforeContext.filter((item) =>
      item.obligation === "review-context-required"
    );
    expect(readyContexts.map((item) => item.subject)).toEqual([
      map.revisionId,
      product.revisionId,
      stakeholder.revisionId,
    ]);
    expect(readyContexts.every((item) => item.dispatchable)).toBe(true);
    expect(beforeContext.slice(0, firstBlockedReview)).toEqual(readyContexts);
    expect(beforeContext.slice(firstBlockedReview).every((item) =>
      item.obligation === "passing-review-required" && !item.dispatchable
    )).toBe(true);

    const intentContext = addAndFreeze(
      baseline(
        "Intent review context",
        "review-context",
        "review-context",
        "create-review-context@1",
      ),
      [map.revisionId, product.revisionId, stakeholder.revisionId],
    );
    const reviewTargets = [map.revisionId, product.revisionId, stakeholder.revisionId];
    for (const subject of reviewTargets) {
      await review(subject, intentContext.revisionId);
    }

    const candidate = addAndFreeze(
      baseline(
        "Intent level candidate",
        "intent-level-candidate",
        "candidate",
        "create-candidate-baseline@1",
      ),
      [map.revisionId, product.revisionId, stakeholder.revisionId, prototype.revisionId],
      [decision.revisionId, question.revisionId],
    );
    const candidateContext = addAndFreeze(
      baseline(
        "Intent candidate review context",
        "review-context",
        "review-context",
        "create-review-context@1",
      ),
      [candidate.revisionId],
    );
    await review(candidate.revisionId, candidateContext.revisionId);

    const gate = looseEnd("candidate-gate-signoff@2", candidate.revisionId);
    expect(gate).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "record-gate-signoff@1",
    }));
    const gateAdapter = await adapter({
      outputs: [{
        name: "decision",
        invocation: 0,
        lifecycleDatum: {
          type: "DEC",
          payload: {
            title: "Approve the exact intent candidate",
            rationale: "All exact candidate members and the candidate passed review",
            kind: "gate-signoff",
            decision: "Approve the exact candidate for the Phase 0 intent gate.",
            alternatives: ["Return the candidate for revision"],
            effective_scope: candidate.revisionId,
          },
          links: [{ type: "justifies", target: candidate.revisionId }],
          body: "Approval applies only to the exact candidate.\n",
        },
      }],
      completionEvidence: { summary: "The user approved the exact candidate." },
    }, "gate-signoff");
    const signedOff = req(
      repositoryRoot,
      "scenario",
      "execute",
      "record-gate-signoff@1",
      "--obligation",
      gate.id,
      "--adapter",
      gateAdapter.executable,
      "--input",
      `candidate=${candidate.revisionId}`,
      "--json",
    );
    expect(signedOff.status, `${signedOff.stderr}${signedOff.stdout}`).toBe(0);
    const signoff = JSON.parse(signedOff.stdout).execution.outputs.find(
      (output: any) => output.name === "decision",
    ).lifecycleDatum as { revisionId: string };

    const awaitingReviewGate = looseEnd(
      "candidate-gate-signoff@2",
      candidate.revisionId,
    );
    expect(awaitingReviewGate).toEqual(expect.objectContaining({
      status: "blocked",
      dispatchable: false,
      eventualResolver: "record-gate-signoff@1",
      actionableResolver: "create-review-context@1",
      blockedBy: [expect.stringContaining(`:${signoff.revisionId}:`)],
    }));
    const duplicateAdapter = await adapter({ outputs: [], completionEvidence: {} }, "duplicate");
    const duplicate = req(
      repositoryRoot,
      "scenario",
      "execute",
      "record-gate-signoff@1",
      "--obligation",
      gate.id,
      "--adapter",
      duplicateAdapter.executable,
      "--input",
      `candidate=${candidate.revisionId}`,
      "--json",
    );
    expect(duplicate.status).toBe(1);
    expect(JSON.parse(duplicate.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "obligation-not-dispatchable" }),
    ]);
    await expect(fs.stat(duplicateAdapter.capture)).rejects.toMatchObject({ code: "ENOENT" });
    const next = req(
      repositoryRoot,
      "next",
      "--phase",
      "phase-0-wayfinding",
      "--json",
    );
    expect(next.status, next.stderr).toBe(0);
    expect(JSON.parse(next.stdout).next.item).toEqual(expect.objectContaining({
      subject: signoff.revisionId,
      actionableResolver: "create-review-context@1",
      dispatchable: true,
    }));

    const signoffContext = addAndFreeze(
      baseline(
        "Gate sign-off review context",
        "review-context",
        "review-context",
        "create-review-context@1",
      ),
      [signoff.revisionId],
    );
    await review(signoff.revisionId, signoffContext.revisionId);

    const phase = req(
      repositoryRoot,
      "phase",
      "status",
      "phase-0-wayfinding",
      "--json",
    );
    expect(phase.status, phase.stderr).toBe(0);
    expect(JSON.parse(phase.stdout).phaseStatus).toEqual(expect.objectContaining({
      entry: expect.objectContaining({ satisfied: true }),
      gate: {
        required: true,
        evaluations: [expect.objectContaining({
          candidate: expect.objectContaining({
            identity: expect.objectContaining({ revision_id: candidate.revisionId }),
          }),
          complete: true,
          status: "satisfied",
          dispatchable: false,
        })],
      },
    }));

    const listed = req(repositoryRoot, "list", "--json");
    expect(listed.status, listed.stderr).toBe(0);
    const reviews = JSON.parse(listed.stdout).data.filter((item: any) =>
      item.lifecycleDatum.datum.type === "REV"
    );
    const expectedReviewTargets = [
      ...reviewTargets,
      candidate.revisionId,
      signoff.revisionId,
    ].sort();
    expect(reviews.map((item: any) =>
      item.lifecycleDatum.datum.links.find((link: any) => link.type === "reviews").target
    ).sort()).toEqual(expectedReviewTargets);
    expect(reviews.every((item: any) =>
      item.lifecycleDatum.storage.frozen === true &&
      item.lifecycleDatum.storage.editable === false
    )).toBe(true);
    const exactContexts = [
      intentContext.revisionId,
      candidateContext.revisionId,
      signoffContext.revisionId,
    ];
    expect(reviews.every((item: any) => {
      const context = item.lifecycleDatum.datum.links.find(
        (link: any) => link.type === "contextualizes",
      );
      return exactContexts.includes(context?.target);
    })).toBe(true);
    for (const context of exactContexts) {
      const shown = req(repositoryRoot, "show", context, "--json");
      expect(shown.status, shown.stderr).toBe(0);
      expect(JSON.parse(shown.stdout).lifecycleDatum.storage).toEqual({
        editable: false,
        frozen: true,
      });
    }
    const doctor = req(repositoryRoot, "doctor", "--json");
    expect(doctor.status, doctor.stderr).toBe(0);
  }, 60_000);
});

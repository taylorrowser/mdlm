import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import type {
  AssignmentPacket,
  AssignmentState,
  JsonObject,
  JsonValue,
  MdlmStatus,
  PreparedAssignmentSubmission,
} from "../src/mdlm-client.js";
import {
  PiAssignmentRunner,
  type PiAssignmentSession,
} from "../src/pi-assignment-runner.js";
import { RunController } from "../src/run-controller.js";
import { RunJournal } from "../src/run-journal.js";
import type { UncapturedPublicationEvidence } from "../src/run-journal.js";

const assignmentId = "3dae4ec3-2aae-444d-87a5-89c6dc4af3fc";
const executionId = "aef8da80-ce4b-420b-afa5-331a06860683";
const scenario = "example@1";
const packageIdentity = {
  reference: "example-package@1",
  digest: `sha256:${"d".repeat(64)}`,
  language: "mdlm-expression@1",
};
const repositoryFingerprint = { head: "base-commit", lifecycle: "sha256:lifecycle" };

describe("RunController", () => {
  const roots: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(roots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true })
    ));
  });

  it("serially allocates, publishes, diagnoses, commits, and reevaluates to completion", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-pi-controller-"));
    roots.push(root);
    const journal = new RunJournal(path.join(root, "state"));
    const response: JsonObject = {
      contract: "mdlm-assignment-response@1",
      assignment: assignmentId,
      kind: "proposal",
      proposal: {},
    };
    const statuses: MdlmStatus[] = [
      assignmentStatus(false),
      { ...assignmentStatus(true), recentTransaction: { available: false } },
      {
        contract: "mdlm-status@1",
        command: "status",
        ok: true,
        currentOutcome: { outcome: "lifecycle-complete", explanation: "done" },
        recentTransaction: { available: true, id: executionId },
      },
    ];
    const commits: string[] = [];
    const mdlm = {
      status: vi.fn(async () => statuses.shift()!),
      next: vi.fn(async () => ({
        contract: "mdlm-next@1" as const,
        command: "next" as const,
        ok: true,
        outcome: "assignment" as const,
        assignment: { id: assignmentId },
        materializedExecutions: [],
      })),
      assignment: vi.fn(async () => ({
        contract: "mdlm-assignment-state@1" as const,
        ok: true,
        command: "assignment.show" as const,
        assignment: { id: assignmentId },
        selected: true as const,
        package: packageIdentity,
        repository: repositoryFingerprint,
        scenarioReference: scenario,
        disposition: "active" as const,
        retryAvailability: { malformedResponseCorrection: 1 },
        malformedResponses: [],
      })),
      prepare: vi.fn(async () => packet()),
      prepareSubmission: vi.fn((value: JsonObject): PreparedAssignmentSubmission => {
        const source = `${JSON.stringify(value)}\n`;
        return {
          response: value,
          source,
          digest: `sha256:${createHash("sha256").update(source).digest("hex")}`,
        };
      }),
      submit: vi.fn(async (prepared: PreparedAssignmentSubmission) => ({
        contract: "mdlm-scenario-execution@4" as const,
        command: "scenario.submit" as const,
        ok: true,
        execution: {
          id: executionId,
          status: "completed",
          definition: { scenario },
          response: { assignment: assignmentId, digest: prepared.digest },
          outputs: [{ lifecycleDatum: { path: `.lifecycle/data/.transactions/${executionId}/map.md` } }],
        },
      })),
      execution: vi.fn(async () => {
        throw new Error("not used");
      }),
      doctor: vi.fn(async () => ({
        contract: "mdlm-doctor@1",
        command: "doctor" as const,
        ok: true,
      })),
    };
    const git = {
      assertClean: vi.fn(async () => undefined),
      head: vi.fn(async () => "base-commit"),
      repositoryFingerprint: baseAdvancementRepository,
      capturePublication,
      publicationCommitState: vi.fn(),
      pendingTransactionIds: vi.fn(async () => []),
      commit: vi.fn(async (publication: { executionId: string }) => {
        commits.push(publication.executionId);
        return "publication-commit";
      }),
    };
    const io = {
      progress: vi.fn(),
      attention: vi.fn(),
      stopped: vi.fn(),
    };
    const assignments = { run: vi.fn(async () => response) };

    const controller = new RunController({ mdlm, git, io, assignments, journal });
    await expect(controller.run()).resolves.toMatchObject({
      status: "lifecycle-complete",
      successful: true,
    });

    expect(assignments.run).toHaveBeenCalledTimes(1);
    expect(mdlm.submit).toHaveBeenCalledTimes(1);
    expect(mdlm.doctor).toHaveBeenCalledTimes(1);
    expect(commits).toEqual([executionId]);
    expect(await journal.load()).toBeNull();
    expect(io.stopped).toHaveBeenCalledWith(
      "lifecycle-complete",
      expect.objectContaining({ outcome: "lifecycle-complete" }),
    );
  });

  it("carries attended authority omitted by the worker into submission", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-pi-attended-authority-"));
    roots.push(root);
    const journal = new RunJournal(path.join(root, "state"));
    const authorityRequirement = {
      mode: "attended",
      authority: "stakeholder",
      delegationAllowed: false,
    };
    const attendedOutcome = {
      outcome: "attention-required",
      assignment: { allocation: "active", id: assignmentId },
      authorityRequirement,
      attentionContext: { invocations: [{ question: "Use the exact accepted boundary?" }] },
    };
    const statuses: MdlmStatus[] = [
      {
        contract: "mdlm-status@1",
        command: "status",
        ok: true,
        package: packageIdentity,
        currentOutcome: attendedOutcome,
        recentTransaction: { available: false },
      },
      {
        contract: "mdlm-status@1",
        command: "status",
        ok: true,
        currentOutcome: attendedOutcome,
        recentTransaction: { available: false },
      },
      {
        contract: "mdlm-status@1",
        command: "status",
        ok: true,
        currentOutcome: { outcome: "lifecycle-complete" },
        recentTransaction: { available: true, id: executionId },
      },
    ];
    const workerResponse: JsonObject = {
      contract: "mdlm-assignment-response@1",
      assignment: assignmentId,
      kind: "proposal",
      proposal: {
        outputs: [],
        completionEvidence: { summary: "Used the attended conclusion exactly." },
        loadedSkillRefs: [],
        authoritySupplies: [],
        standingDelegations: [],
      },
    };
    const session: PiAssignmentSession = {
      get isIdle() { return true; },
      prompt: vi.fn(async () => undefined),
      abort: vi.fn(async () => undefined),
      dispose: vi.fn(),
      subscribe: vi.fn(() => () => {}),
    };
    const assignments = new PiAssignmentRunner({
      repository: root,
      assignmentTimeoutMs: 1_000,
      sessionFactory: vi.fn(async (_packet, capture) => {
        session.prompt = vi.fn(async () => { capture(workerResponse); });
        return session;
      }),
    });
    const mdlm = {
      status: vi.fn(async () => statuses.shift()!),
      next: vi.fn(),
      assignment: vi.fn(async () => activeAssignmentState()),
      prepare: vi.fn(async () => packet()),
      prepareSubmission: vi.fn((value: JsonObject): PreparedAssignmentSubmission => {
        const source = `${JSON.stringify(value)}\n`;
        return {
          response: value,
          source,
          digest: `sha256:${createHash("sha256").update(source).digest("hex")}`,
        };
      }),
      submit: vi.fn(async (prepared: PreparedAssignmentSubmission) => ({
        contract: "mdlm-scenario-execution@4" as const,
        command: "scenario.submit" as const,
        ok: true,
        execution: executionRecord(prepared.digest),
      })),
      execution: vi.fn(),
      doctor: vi.fn(async () => ({ command: "doctor" as const, ok: true })),
    };
    const git = {
      assertClean: vi.fn(async () => undefined),
      head: vi.fn(async () => "base-commit"),
      repositoryFingerprint: baseAdvancementRepository,
      capturePublication,
      publicationCommitState: vi.fn(),
      pendingTransactionIds: vi.fn(async () => []),
      commit: vi.fn(async () => "publication-commit"),
    };
    const conclusion = { statement: "Use the exact accepted boundary." };
    const io = {
      progress: vi.fn(),
      attention: vi.fn(async () => ({ conclusion })),
      stopped: vi.fn(),
    };

    await expect(new RunController({ mdlm, assignments, git, io, journal }).run())
      .resolves.toMatchObject({ status: "lifecycle-complete", successful: true });

    expect(mdlm.submit).toHaveBeenCalledTimes(1);
    expect(mdlm.submit.mock.calls[0]?.[0].response).toEqual({
      ...workerResponse,
      proposal: {
        ...(workerResponse.proposal as JsonObject),
        authoritySupplies: ["stakeholder"],
      },
    });
    expect(io.attention).toHaveBeenCalledTimes(1);
  });

  it("recovers one exact immediate attended context before worker response capture", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-pi-immediate-attended-recovery-"));
    roots.push(root);
    const journal = new RunJournal(path.join(root, "state"));
    const authorityRequirement = {
      mode: "attended",
      authority: "stakeholder",
      delegationAllowed: false,
    };
    const outcome = {
      outcome: "attention-required",
      assignment: { allocation: "active", id: assignmentId },
      authorityRequirement,
      attentionContext: { invocations: [{ question: "Preserve this exact conclusion?" }] },
    };
    const mdlm = {
      status: vi.fn(async (): Promise<MdlmStatus> => ({
        contract: "mdlm-status@1",
        command: "status",
        ok: true,
        package: packageIdentity,
        currentOutcome: outcome,
        recentTransaction: { available: false },
      })),
      next: vi.fn(),
      assignment: vi.fn(),
      prepare: vi.fn(async () => packet()),
      prepareSubmission: vi.fn(),
      submit: vi.fn(),
      execution: vi.fn(),
      doctor: vi.fn(),
    };
    const git = {
      assertClean: vi.fn(async () => undefined),
      head: vi.fn(),
      repositoryFingerprint: baseAdvancementRepository,
      capturePublication,
      publicationCommitState: vi.fn(),
      pendingTransactionIds: vi.fn(),
      commit: vi.fn(),
    };
    const conclusion = {
      statement: "Preserve the accepted conclusion exactly.\nIncluding this line.",
    };
    const io = {
      progress: vi.fn(),
      attention: vi.fn(async () => ({
        conclusion,
        rawTranscript: "must-not-persist",
      })),
      stopped: vi.fn(),
    };
    const expectedContext = {
      authorityRequirement,
      authoritySupply: {
        authority: "stakeholder",
        source: "attended-authority-holder",
      },
      conclusion,
      attentionContext: outcome.attentionContext,
    };
    const firstAssignments = {
      run: vi.fn(async () => { throw new Error("worker crashed before response capture"); }),
    };

    await expect(new RunController({ mdlm, assignments: firstAssignments, git, io, journal }).run())
      .rejects.toThrow("worker crashed before response capture");

    for (const changedPacket of [
      { ...packet(), package: { ...packageIdentity, digest: `sha256:${"e".repeat(64)}` } },
      { ...packet(), repository: { ...repositoryFingerprint, head: "changed-head" } },
    ]) {
      const changedAssignments = { run: vi.fn() };
      await expect(new RunController({
        mdlm: { ...mdlm, prepare: vi.fn(async () => changedPacket) },
        assignments: changedAssignments,
        git,
        io,
        journal: new RunJournal(path.join(root, "state")),
      }).run()).rejects.toThrow(`Assignment '${assignmentId}' attended recovery boundary changed`);
      expect(changedAssignments.run).not.toHaveBeenCalled();
    }

    const recoveredAssignments = {
      run: vi.fn(async (_packet: AssignmentPacket, options?: { attendedContext?: JsonValue }) => {
        expect(options?.attendedContext).toEqual(expectedContext);
        throw new Error("recovered exact attended context");
      }),
    };
    await expect(new RunController({
      mdlm,
      assignments: recoveredAssignments,
      git,
      io,
      journal: new RunJournal(path.join(root, "state")),
    }).run()).rejects.toThrow("recovered exact attended context");

    expect(io.attention).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(conclusion)).not.toContain("must-not-persist");
  });

  it("carries the same attended authority through malformed-response correction", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-pi-attended-correction-"));
    roots.push(root);
    const journal = new RunJournal(path.join(root, "state"));
    const authorityRequirement = {
      mode: "attended",
      authority: "stakeholder",
      delegationAllowed: false,
    };
    const attendedOutcome = {
      outcome: "attention-required",
      assignment: { allocation: "active", id: assignmentId },
      authorityRequirement,
      attentionContext: { invocations: [{ question: "Keep the exact conclusion?" }] },
    };
    const status = (outcome: JsonObject, recentId?: string): MdlmStatus => ({
      contract: "mdlm-status@1",
      command: "status",
      ok: true,
      package: packageIdentity,
      currentOutcome: outcome as MdlmStatus["currentOutcome"],
      recentTransaction: recentId === undefined
        ? { available: false }
        : { available: true, id: recentId },
    });
    const statuses = [
      status(attendedOutcome),
      status(attendedOutcome),
      status(attendedOutcome),
      status({ outcome: "lifecycle-complete" }, executionId),
    ];
    const response = (revision: string): JsonObject => ({
      contract: "mdlm-assignment-response@1",
      assignment: assignmentId,
      kind: "proposal",
      proposal: {
        outputs: [],
        completionEvidence: { revision },
        loadedSkillRefs: [],
        authoritySupplies: [],
        standingDelegations: [],
      },
    });
    const workerResponses = [response("initial"), response("corrected")];
    const prompts: string[] = [];
    const session: PiAssignmentSession = {
      get isIdle() { return true; },
      prompt: vi.fn(async () => undefined),
      abort: vi.fn(async () => undefined),
      dispose: vi.fn(),
      subscribe: vi.fn(() => () => {}),
    };
    const assignments = new PiAssignmentRunner({
      repository: root,
      assignmentTimeoutMs: 1_000,
      sessionFactory: vi.fn(async (_packet, capture) => {
        session.prompt = vi.fn(async (prompt: string) => {
          prompts.push(prompt);
          capture(workerResponses.shift()!);
        });
        return session;
      }),
    });
    let malformedDigest: `sha256:${string}` | undefined;
    let submissionCount = 0;
    const submittedResponses: JsonObject[] = [];
    const mdlm = {
      status: vi.fn(async () => statuses.shift()!),
      next: vi.fn(),
      assignment: vi.fn(async () => ({
        ...activeAssignmentState(),
        malformedResponses: malformedDigest === undefined
          ? []
          : [{ digest: malformedDigest, diagnostics: [{ code: "FIX", message: "Correct output" }] }],
      })),
      prepare: vi.fn(async () => packet()),
      prepareSubmission: vi.fn((value: JsonObject): PreparedAssignmentSubmission => {
        const source = `${JSON.stringify(value)}\n`;
        return {
          response: value,
          source,
          digest: `sha256:${createHash("sha256").update(source).digest("hex")}`,
        };
      }),
      submit: vi.fn(async (prepared: PreparedAssignmentSubmission) => {
        submittedResponses.push(prepared.response);
        if (submissionCount++ === 0) {
          malformedDigest = prepared.digest;
          return {
            contract: "mdlm-assignment-disposition@1" as const,
            command: "scenario.submit" as const,
            ok: false,
            assignment: { id: assignmentId },
            disposition: "correction-required",
            malformedResponse: {
              attempt: 1,
              correctionsRemaining: 1,
              diagnostics: [{ code: "FIX", message: "Correct output" }],
            },
          };
        }
        return {
          contract: "mdlm-scenario-execution@4" as const,
          command: "scenario.submit" as const,
          ok: true,
          execution: executionRecord(prepared.digest),
        };
      }),
      execution: vi.fn(),
      doctor: vi.fn(async () => ({ command: "doctor" as const, ok: true })),
    };
    const git = {
      assertClean: vi.fn(async () => undefined),
      head: vi.fn(async () => "base-commit"),
      repositoryFingerprint: baseAdvancementRepository,
      capturePublication,
      publicationCommitState: vi.fn(),
      pendingTransactionIds: vi.fn(async () => []),
      commit: vi.fn(async () => "publication-commit"),
    };
    const conclusion = { statement: "Keep the accepted conclusion byte-for-byte." };
    const io = {
      progress: vi.fn(),
      attention: vi.fn(async () => ({ conclusion })),
      stopped: vi.fn(),
    };

    await expect(new RunController({ mdlm, assignments, git, io, journal }).run())
      .resolves.toMatchObject({ status: "lifecycle-complete", successful: true });

    expect(submittedResponses).toHaveLength(2);
    expect(submittedResponses[0]?.proposal).toMatchObject({
      completionEvidence: { revision: "initial" },
      authoritySupplies: ["stakeholder"],
    });
    expect(submittedResponses[1]?.proposal).toMatchObject({
      completionEvidence: { revision: "corrected" },
      authoritySupplies: ["stakeholder"],
    });
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain(JSON.stringify(conclusion));
    expect(io.attention).toHaveBeenCalledTimes(1);
  });

  it("stops on an exact recovery mismatch instead of leasing replacement work", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-pi-pre-response-"));
    roots.push(root);
    const journal = new RunJournal(path.join(root, "state"));
    const mdlm = {
      status: vi.fn(async (): Promise<MdlmStatus> => ({
        contract: "mdlm-status@1",
        command: "status",
        ok: true,
        package: { reference: "changed-package@1", digest: "sha256:changed" },
        currentOutcome: {
          outcome: "assignment",
          assignment: { allocation: "not-allocated", id: assignmentId },
        },
        recentTransaction: { available: false },
      })),
      next: vi.fn(async () => {
        throw new Error("replacement work was leased");
      }),
      assignment: vi.fn(),
      prepare: vi.fn(async () => {
        throw new Error(`Assignment '${assignmentId}' selected Process Package changed during recovery`);
      }),
      prepareSubmission: vi.fn(),
      submit: vi.fn(),
      execution: vi.fn(),
      doctor: vi.fn(),
    };
    const controller = new RunController({
      mdlm,
      assignments: { run: vi.fn() },
      git: {
        assertClean: vi.fn(async () => undefined),
        head: vi.fn(async () => "changed-head"),
        repositoryFingerprint: vi.fn(async () => advancementRepository("changed-head", "c")),
        capturePublication,
        publicationCommitState: vi.fn(),
        pendingTransactionIds: vi.fn(async () => []),
        commit: vi.fn(),
      },
      io: { progress: vi.fn(), attention: vi.fn(), stopped: vi.fn() },
      journal,
    });

    await expect(controller.run()).rejects.toThrow("changed during recovery");
    expect(mdlm.prepare).toHaveBeenCalledWith(assignmentId);
    expect(mdlm.next).not.toHaveBeenCalled();
  });

  it("prepares only a post-materialization Assignment bound to the committed repository", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-pi-advance-"));
    roots.push(root);
    const journal = new RunJournal(path.join(root, "state"));
    const materializationDigest = `sha256:${"a".repeat(64)}` as const;
    const freshAssignmentId = "e9ab75f1-d9eb-411d-8c76-5813594af02a";
    const freshExecutionId = "66d46c68-94e9-4de4-ae9c-0a13f31e915a";
    const staleAssignmentId = "pre-commit-stale-assignment";
    const postCommitRepository = advancementRepository("materialization-commit", "b");
    const statuses: MdlmStatus[] = [
      assignmentStatus(false),
      {
        contract: "mdlm-status@1",
        command: "status",
        ok: true,
        package: packageIdentity,
        currentOutcome: {
          outcome: "assignment",
          assignment: { allocation: "not-allocated", id: staleAssignmentId },
        },
        recentTransaction: { available: true, id: executionId },
      },
      {
        contract: "mdlm-status@1",
        command: "status",
        ok: true,
        package: packageIdentity,
        currentOutcome: {
          outcome: "assignment",
          assignment: { allocation: "active", id: freshAssignmentId },
        },
        recentTransaction: { available: true, id: executionId },
      },
      {
        contract: "mdlm-status@1",
        command: "status",
        ok: true,
        currentOutcome: { outcome: "lifecycle-complete", explanation: "done" },
        recentTransaction: { available: true, id: freshExecutionId },
      },
    ];
    const nextOutcomes = [
      {
        contract: "mdlm-next@1" as const,
        command: "next" as const,
        ok: true,
        outcome: "assignment" as const,
        assignment: { id: staleAssignmentId },
        materializedExecutions: [{ id: executionId, scenario, status: "completed" as const }],
      },
      {
        contract: "mdlm-next@1" as const,
        command: "next" as const,
        ok: true,
        outcome: "assignment" as const,
        assignment: { id: freshAssignmentId },
        materializedExecutions: [],
      },
    ];
    const response: JsonObject = { assignment: freshAssignmentId, complete: true };
    let currentHead = advancementRepository("base-commit", "a").head;
    const mdlm = {
      status: vi.fn(async () => statuses.shift()!),
      next: vi.fn(async () => nextOutcomes.shift()!),
      assignment: vi.fn(async () => ({
        ...activeAssignmentState(),
        assignment: { id: freshAssignmentId },
        repository: postCommitRepository,
      })),
      prepare: vi.fn(async (id: string) => {
        if (id === staleAssignmentId) {
          throw new Error("stale pre-materialization Assignment was prepared");
        }
        return {
          ...packet(freshAssignmentId),
          repository: postCommitRepository,
        };
      }),
      prepareSubmission: vi.fn((value: JsonObject): PreparedAssignmentSubmission => {
        const source = `${JSON.stringify(value)}\n`;
        return {
          response: value,
          source,
          digest: `sha256:${createHash("sha256").update(source).digest("hex")}`,
        };
      }),
      submit: vi.fn(async (prepared: PreparedAssignmentSubmission) => ({
        contract: "mdlm-scenario-execution@4" as const,
        command: "scenario.submit" as const,
        ok: true,
        execution: {
          ...executionRecord(prepared.digest),
          id: freshExecutionId,
          response: { assignment: freshAssignmentId, digest: prepared.digest },
        },
      })),
      execution: vi.fn(async () => ({
        ok: true as const,
        command: "scenario.execution.show" as const,
        execution: executionRecord(materializationDigest),
      })),
      doctor: vi.fn(async () => ({ command: "doctor" as const, ok: true })),
    };
    const git = {
      assertClean: vi.fn(async () => undefined),
      head: vi.fn(async () => currentHead),
      repositoryFingerprint: vi.fn(async () =>
        currentHead === advancementRepository("base-commit", "a").head
          ? advancementRepository("base-commit", "a")
          : postCommitRepository
      ),
      capturePublication,
      publicationCommitState: vi.fn(),
      pendingTransactionIds: vi.fn(async () =>
        currentHead === advancementRepository("base-commit", "a").head ? [executionId] : []
      ),
      commit: vi.fn(async (publication: { executionId: string }) => {
        const materialization = publication.executionId === executionId;
        currentHead = advancementRepository(
          materialization ? "materialization-commit" : "assignment-commit",
          materialization ? "b" : "c",
        ).head;
        return currentHead;
      }),
    };
    const assignments = {
      run: vi.fn(async (preparedPacket: AssignmentPacket) => {
        expect(preparedPacket.assignment.id).toBe(freshAssignmentId);
        expect(preparedPacket.repository).toEqual(postCommitRepository);
        expect(currentHead).toBe(postCommitRepository.head);
        return response;
      }),
    };
    const io = { progress: vi.fn(), attention: vi.fn(), stopped: vi.fn() };
    const controller = new RunController({ mdlm, assignments, git, io, journal });

    await expect(controller.run()).resolves.toMatchObject({
      status: "lifecycle-complete",
      successful: true,
    });
    expect(mdlm.next).toHaveBeenCalledTimes(2);
    expect(mdlm.prepare).toHaveBeenCalledTimes(1);
    expect(mdlm.prepare).toHaveBeenCalledWith(freshAssignmentId);
    expect(assignments.run).toHaveBeenCalledTimes(1);
    expect(git.commit).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        executionId,
        responseDigest: materializationDigest,
      }),
      advancementRepository("base-commit", "a").head,
      [],
    );
    expect(git.commit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ executionId: freshExecutionId }),
      advancementRepository("materialization-commit", "b").head,
    );
    expect(mdlm.doctor).toHaveBeenCalledTimes(2);
    expect(await journal.load()).toBeNull();
  });

  it("resumes post-materialization reevaluation without recommitting or preparing a stale projection", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-pi-reevaluate-"));
    roots.push(root);
    const journal = new RunJournal(path.join(root, "state"));
    await materializationReevaluationJournal(journal);
    expect(await journal.load()).toEqual({
      contract: "mdlm-pi-run-journal@1",
      phase: "reevaluating",
      boundary: {
        package: packageIdentity,
        repository: advancementRepository("materialization-commit", "b"),
      },
    });

    const mdlm = {
      status: vi.fn(async (): Promise<MdlmStatus> => ({
        contract: "mdlm-status@1",
        command: "status",
        ok: true,
        package: packageIdentity,
        currentOutcome: {
          outcome: "assignment",
          assignment: {
            allocation: "not-allocated",
            id: "pre-commit-stale-assignment",
          },
        },
        recentTransaction: { available: true, id: executionId },
      })),
      next: vi.fn(async () => ({
        contract: "mdlm-next@1" as const,
        command: "next" as const,
        ok: true,
        outcome: "lifecycle-complete" as const,
        materializedExecutions: [],
      })),
      assignment: vi.fn(),
      prepare: vi.fn(),
      prepareSubmission: vi.fn(),
      submit: vi.fn(),
      execution: vi.fn(),
      doctor: vi.fn(),
    };
    const git = {
      assertClean: vi.fn(async () => undefined),
      head: vi.fn(async () => "materialization-commit"),
      repositoryFingerprint: vi.fn(async () =>
        advancementRepository("materialization-commit", "b")
      ),
      capturePublication,
      publicationCommitState: vi.fn(),
      pendingTransactionIds: vi.fn(async () => []),
      commit: vi.fn(async () => {
        throw new Error("automatic materialization was committed twice");
      }),
    };
    const controller = new RunController({
      mdlm,
      assignments: { run: vi.fn() },
      git,
      io: { progress: vi.fn(), attention: vi.fn(), stopped: vi.fn() },
      journal,
    });

    await expect(controller.run()).resolves.toMatchObject({
      status: "lifecycle-complete",
      successful: true,
    });
    expect(mdlm.status).toHaveBeenCalledTimes(1);
    expect(mdlm.next).toHaveBeenCalledTimes(1);
    expect(mdlm.prepare).not.toHaveBeenCalled();
    expect(git.commit).not.toHaveBeenCalled();
    expect(await journal.load()).toBeNull();
  });

  it.each([
    {
      boundary: "before next with a stale pre-commit projection",
      statusAssignment: {
        allocation: "not-allocated",
        id: "pre-commit-stale-assignment",
      },
    },
    {
      boundary: "after next allocated its hidden durable lease",
      statusAssignment: {
        allocation: "active",
        id: "9fa386f9-76d8-441c-80d8-b46fe1dbea94",
      },
    },
  ])("retries reevaluation after crashing $boundary", async ({ statusAssignment }) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-pi-reevaluate-next-gap-"));
    roots.push(root);
    const journal = new RunJournal(path.join(root, "state"));
    await materializationReevaluationJournal(journal);
    await journal.beginAdvancement({
      package: packageIdentity,
      repository: advancementRepository("materialization-commit", "b"),
      previousTransactionId: executionId,
    });
    expect(await journal.load()).toMatchObject({
      phase: "advancing",
      advancement: { purpose: "post-materialization-reevaluation" },
    });
    const staleAssignmentId = "pre-commit-stale-assignment";
    const freshAssignmentId = "9fa386f9-76d8-441c-80d8-b46fe1dbea94";
    const staleStatus: MdlmStatus = {
      contract: "mdlm-status@1",
      command: "status",
      ok: true,
      package: packageIdentity,
      currentOutcome: {
        outcome: "assignment",
        assignment: statusAssignment,
      },
      recentTransaction: { available: true, id: executionId },
    };
    const mdlm = {
      status: vi.fn(async () => staleStatus),
      next: vi.fn(async () => ({
        contract: "mdlm-next@1" as const,
        command: "next" as const,
        ok: true,
        outcome: "assignment" as const,
        assignment: { id: freshAssignmentId },
        materializedExecutions: [],
      })),
      assignment: vi.fn(),
      prepare: vi.fn(async (id: string) => {
        if (id === staleAssignmentId) throw new Error("stale Assignment was prepared");
        throw new Error("fresh reevaluated Assignment was prepared");
      }),
      prepareSubmission: vi.fn(),
      submit: vi.fn(),
      execution: vi.fn(),
      doctor: vi.fn(),
    };
    const controller = new RunController({
      mdlm,
      assignments: { run: vi.fn() },
      git: {
        assertClean: vi.fn(async () => undefined),
        head: vi.fn(async () => advancementRepository("materialization-commit", "b").head),
        repositoryFingerprint: vi.fn(async () =>
          advancementRepository("materialization-commit", "b")
        ),
        capturePublication,
        publicationCommitState: vi.fn(),
        pendingTransactionIds: vi.fn(async () => []),
        commit: vi.fn(),
      },
      io: { progress: vi.fn(), attention: vi.fn(), stopped: vi.fn() },
      journal,
    });

    await expect(controller.run()).rejects.toThrow(
      "fresh reevaluated Assignment was prepared",
    );
    expect(mdlm.status).toHaveBeenCalledTimes(1);
    expect(mdlm.next).toHaveBeenCalledTimes(1);
    expect(mdlm.prepare).toHaveBeenCalledWith(freshAssignmentId);
    expect(await journal.load()).toBeNull();
  });

  it("reports Invalid after materialization without crossing or clearing its boundary", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-pi-reevaluate-invalid-"));
    roots.push(root);
    const journal = new RunJournal(path.join(root, "state"));
    await materializationReevaluationJournal(journal);
    const expectedJournal = await journal.load();
    const invalid = {
      outcome: "invalid",
      diagnostics: [{ code: "INVALID", message: "post-materialization invalid" }],
    };
    const mdlm = {
      status: vi.fn(async (): Promise<MdlmStatus> => ({
        contract: "mdlm-status@1",
        command: "status",
        ok: false,
        currentOutcome: invalid,
        recentTransaction: { available: true, id: executionId },
      })),
      next: vi.fn(),
      assignment: vi.fn(),
      prepare: vi.fn(),
      prepareSubmission: vi.fn(),
      submit: vi.fn(),
      execution: vi.fn(),
      doctor: vi.fn(),
    };
    const io = { progress: vi.fn(), attention: vi.fn(), stopped: vi.fn() };
    const controller = new RunController({
      mdlm,
      assignments: { run: vi.fn() },
      git: {
        assertClean: vi.fn(),
        head: vi.fn(),
        repositoryFingerprint: vi.fn(),
        capturePublication,
        publicationCommitState: vi.fn(),
        pendingTransactionIds: vi.fn(),
        commit: vi.fn(),
      },
      io,
      journal,
    });

    await expect(controller.run()).resolves.toEqual({
      status: "invalid",
      details: invalid,
      successful: false,
    });
    expect(io.stopped).toHaveBeenCalledWith("invalid", invalid);
    expect(mdlm.next).not.toHaveBeenCalled();
    expect(await journal.load()).toEqual(expectedJournal);
  });

  it.each([
    {
      boundary: "empty package reference",
      currentPackage: { ...packageIdentity, reference: "" },
      expectedError: "Expected reevaluation recovery.package.reference to be nonempty",
    },
    {
      boundary: "non-sha256 package digest",
      currentPackage: { ...packageIdentity, digest: "sha256:not-exact" },
      expectedError: "Expected reevaluation recovery.package.digest to be an exact sha256 identity",
    },
    {
      boundary: "missing expression language",
      currentPackage: {
        reference: packageIdentity.reference,
        digest: packageIdentity.digest,
      },
      expectedError: "Expected reevaluation recovery.package.language",
    },
    {
      boundary: "changed expression language",
      currentPackage: { ...packageIdentity, language: "mdlm-expression@older" },
      expectedError: "selected Process Package changed during reevaluation recovery",
    },
  ])("stops before allocation for $boundary in status", async ({
    currentPackage,
    expectedError,
  }) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-pi-status-package-"));
    roots.push(root);
    const journal = new RunJournal(path.join(root, "state"));
    await materializationReevaluationJournal(journal);
    const expectedJournal = await journal.load();
    const mdlm = {
      status: vi.fn(async (): Promise<MdlmStatus> => ({
        contract: "mdlm-status@1",
        command: "status",
        ok: true,
        package: currentPackage,
        currentOutcome: {
          outcome: "assignment",
          assignment: { allocation: "not-allocated" },
        },
        recentTransaction: { available: true, id: executionId },
      })),
      next: vi.fn(),
      assignment: vi.fn(),
      prepare: vi.fn(),
      prepareSubmission: vi.fn(),
      submit: vi.fn(),
      execution: vi.fn(),
      doctor: vi.fn(),
    };
    const controller = new RunController({
      mdlm,
      assignments: { run: vi.fn() },
      git: {
        assertClean: vi.fn(),
        head: vi.fn(),
        repositoryFingerprint: vi.fn(async () =>
          advancementRepository("materialization-commit", "b")
        ),
        capturePublication,
        publicationCommitState: vi.fn(),
        pendingTransactionIds: vi.fn(),
        commit: vi.fn(),
      },
      io: { progress: vi.fn(), attention: vi.fn(), stopped: vi.fn() },
      journal,
    });

    await expect(controller.run()).rejects.toThrow(expectedError);
    expect(mdlm.next).not.toHaveBeenCalled();
    expect(await journal.load()).toEqual(expectedJournal);
  });

  it.each([
    {
      boundary: "selected Process Package",
      currentPackage: {
        reference: "changed-package@1",
        digest: `sha256:${"e".repeat(64)}`,
        language: "mdlm-expression@1",
      },
      currentHead: "materialization-commit",
      expectedError: "selected Process Package changed during reevaluation recovery",
    },
    {
      boundary: "repository fingerprint",
      currentPackage: packageIdentity,
      currentHead: "external-clean-commit",
      expectedError: "repository fingerprint changed during reevaluation recovery",
    },
  ])("stops before fresh allocation when the $boundary changed during reevaluating", async ({
    currentPackage,
    currentHead,
    expectedError,
  }) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-pi-reevaluate-boundary-"));
    roots.push(root);
    const journal = new RunJournal(path.join(root, "state"));
    await materializationReevaluationJournal(journal);
    const expectedJournal = await journal.load();
    const mdlm = {
      status: vi.fn(async (): Promise<MdlmStatus> => ({
        contract: "mdlm-status@1",
        command: "status",
        ok: true,
        package: currentPackage,
        currentOutcome: {
          outcome: "assignment",
          assignment: { allocation: "not-allocated" },
        },
        recentTransaction: { available: true, id: executionId },
      })),
      next: vi.fn(async () => {
        throw new Error("fresh allocation crossed a changed recovery boundary");
      }),
      assignment: vi.fn(),
      prepare: vi.fn(),
      prepareSubmission: vi.fn(),
      submit: vi.fn(),
      execution: vi.fn(),
      doctor: vi.fn(),
    };
    const controller = new RunController({
      mdlm,
      assignments: { run: vi.fn() },
      git: {
        assertClean: vi.fn(async () => undefined),
        head: vi.fn(async () => currentHead),
        repositoryFingerprint: vi.fn(async () =>
          advancementRepository(currentHead, currentHead === "materialization-commit" ? "b" : "c")
        ),
        capturePublication,
        publicationCommitState: vi.fn(),
        pendingTransactionIds: vi.fn(async () => []),
        commit: vi.fn(),
      },
      io: { progress: vi.fn(), attention: vi.fn(), stopped: vi.fn() },
      journal,
    });

    await expect(controller.run()).rejects.toThrow(expectedError);
    expect(mdlm.next).not.toHaveBeenCalled();
    expect(mdlm.prepare).not.toHaveBeenCalled();
    expect(await journal.load()).toEqual(expectedJournal);
  });

  it("asks again for an active attended Assignment whose package identity is at status root", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-pi-attended-restart-"));
    roots.push(root);
    const journal = new RunJournal(path.join(root, "state"));
    const outcome = {
      outcome: "attention-required",
      assignment: { allocation: "active", id: assignmentId },
      authorityRequirement: {
        mode: "attended",
        authority: "stakeholder",
        delegationAllowed: false,
      },
      checkpointConversation: {
        checkpoint: "checkpoint-1",
        consolidationGroup: "group-1",
        items: [{ instance: "question-1" }],
      },
    };
    const mdlm = {
      status: vi.fn(async (): Promise<MdlmStatus> => ({
        contract: "mdlm-status@1",
        command: "status",
        ok: true,
        package: packageIdentity,
        currentOutcome: outcome,
        recentTransaction: { available: false },
      })),
      next: vi.fn(),
      assignment: vi.fn(),
      prepare: vi.fn(async () => packet()),
      prepareSubmission: vi.fn(),
      submit: vi.fn(),
      execution: vi.fn(),
      doctor: vi.fn(),
    };
    const io = {
      progress: vi.fn(),
      attention: vi.fn(async () => ({
        conclusion: { answer: "inside" },
        rawTranscript: "must-not-persist",
      })),
      stopped: vi.fn(),
    };
    const assignments = {
      run: vi.fn(async (assignmentPacket: AssignmentPacket) => {
        expect(assignmentPacket.assignment.id).toBe(assignmentId);
        throw new Error("attended Assignment reached worker");
      }),
    };
    const controller = new RunController({
      mdlm,
      assignments,
      git: {
        assertClean: vi.fn(async () => undefined),
        head: vi.fn(),
        repositoryFingerprint: baseAdvancementRepository,
        capturePublication,
        publicationCommitState: vi.fn(),
        pendingTransactionIds: vi.fn(),
        commit: vi.fn(),
      },
      io,
      journal,
    });

    await expect(controller.run()).rejects.toThrow("attended Assignment reached worker");
    expect(io.attention).toHaveBeenCalledWith({ ...outcome, package: packageIdentity });
    expect(assignments.run).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(await journal.loadAttendedConclusions())).not.toContain(
      "must-not-persist",
    );
  });

  it("reuses one normalized attended conclusion across a checkpoint group without persisting raw conversation", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-pi-attended-"));
    roots.push(root);
    const journal = new RunJournal(path.join(root, "state"));
    const secondAssignmentId = "c3171fc4-54c2-4524-8d92-02968ff2f6a0";
    const secondExecutionId = "b7fcab68-7094-45db-bfb2-bfa3de4c6c24";
    const authorityRequirement = {
      mode: "attended",
      authority: "stakeholder",
      delegationAllowed: false,
    };
    const firstOutcome = {
      outcome: "attention-required",
      package: packageIdentity,
      assignment: { allocation: "active", id: assignmentId },
      authorityRequirement,
      attentionContext: { invocations: [{ question: "Choose both exact boundaries" }] },
      checkpointConversation: {
        checkpoint: "checkpoint-1",
        consolidationGroup: "group-1",
        items: [{ instance: "question-1" }, { instance: "question-2" }],
      },
    };
    const secondOutcome = {
      ...firstOutcome,
      assignment: { allocation: "active", id: secondAssignmentId },
      attentionContext: { invocations: [{ question: "Choose the second exact boundary" }] },
      checkpointConversation: {
        ...firstOutcome.checkpointConversation,
        items: [{ instance: "question-2" }],
      },
    };
    const status = (
      currentOutcome: MdlmStatus["currentOutcome"],
      recentId?: string,
    ): MdlmStatus => ({
      contract: "mdlm-status@1",
      command: "status",
      ok: true,
      currentOutcome,
      recentTransaction: recentId === undefined
        ? { available: false }
        : { available: true, id: recentId },
    });
    const statuses: MdlmStatus[] = [
      status(firstOutcome),
      status(firstOutcome),
      status(secondOutcome, executionId),
      status(secondOutcome, executionId),
      status({ outcome: "lifecycle-complete" }, secondExecutionId),
    ];
    let submissionIndex = 0;
    const mdlm = {
      status: vi.fn(async () => statuses.shift()!),
      next: vi.fn(),
      assignment: vi.fn(async (id: string) => ({
        ...activeAssignmentState(),
        assignment: { id },
      })),
      prepare: vi.fn(async (id: string) => packet(id)),
      prepareSubmission: vi.fn((value: JsonObject): PreparedAssignmentSubmission => {
        const source = `${JSON.stringify(value)}\n`;
        return {
          response: value,
          source,
          digest: `sha256:${createHash("sha256").update(source).digest("hex")}`,
        };
      }),
      submit: vi.fn(async (prepared: PreparedAssignmentSubmission) => {
        const id = submissionIndex++ === 0 ? executionId : secondExecutionId;
        const submittedAssignment = prepared.response.assignment;
        if (typeof submittedAssignment !== "string") {
          throw new Error("Attended response omitted its Assignment ID");
        }
        return {
          contract: "mdlm-scenario-execution@4" as const,
          command: "scenario.submit" as const,
          ok: true,
          execution: {
            contract: "mdlm-scenario-execution@4",
            id,
            status: "completed",
            definition: { scenario },
            response: {
              assignment: submittedAssignment,
              digest: prepared.digest,
            },
            outputs: [{
              lifecycleDatum: {
                path: `.lifecycle/data/.transactions/${id}/map.md`,
              },
            }],
          },
        };
      }),
      execution: vi.fn(),
      doctor: vi.fn(async () => ({ command: "doctor" as const, ok: true })),
    };
    const attendedAnswer = { first: "inside", second: "outside" };
    const attendedExchange = {
      conclusion: attendedAnswer,
      rawTranscript: "must-not-persist",
    };
    const normalizedConclusion = {
      authority: "stakeholder",
      checkpoint: "checkpoint-1",
      consolidationGroup: "group-1",
      itemInstances: ["question-1", "question-2"],
      conclusion: attendedAnswer,
    };
    const io = {
      progress: vi.fn(),
      attention: vi.fn(async () => attendedExchange),
      stopped: vi.fn(),
    };
    const assignments = {
      run: vi.fn(async (assignmentPacket: AssignmentPacket, options?: { attendedContext?: unknown }) => {
        const outcome = assignmentPacket.assignment.id === assignmentId
          ? firstOutcome
          : secondOutcome;
        expect(options?.attendedContext).toEqual({
          authorityRequirement,
          authoritySupply: {
            authority: "stakeholder",
            source: "attended-authority-holder",
          },
          conclusion: normalizedConclusion,
          attentionContext: outcome.attentionContext,
          checkpointConversation: outcome.checkpointConversation,
        });
        expect(await journal.load()).toBeNull();
        expect(JSON.stringify(await journal.loadAttendedConclusions())).not.toContain(
          "must-not-persist",
        );
        return { assignment: assignmentPacket.assignment.id, attended: true };
      }),
    };
    const git = {
      assertClean: vi.fn(async () => undefined),
      head: vi.fn(async () => "base-commit"),
      repositoryFingerprint: baseAdvancementRepository,
      capturePublication,
      publicationCommitState: vi.fn(),
      pendingTransactionIds: vi.fn(async () => []),
      commit: vi.fn(async () => "attended-commit"),
    };
    const controller = new RunController({ mdlm, assignments, git, io, journal });

    await expect(controller.run()).resolves.toMatchObject({
      status: "lifecycle-complete",
      successful: true,
    });
    expect(io.attention).toHaveBeenCalledTimes(1);
    expect(io.attention).toHaveBeenCalledWith(firstOutcome);
    expect(assignments.run).toHaveBeenCalledTimes(2);
    expect(await journal.load()).toBeNull();
    expect(await journal.loadAttendedConclusions()).toBeNull();
  });

  it("submits exact captured attended response bytes after restart without rerunning the worker", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-pi-captured-"));
    roots.push(root);
    const journal = new RunJournal(path.join(root, "state"));
    const exactConclusion = "Keep line one.\nKeep line two byte-for-byte.";
    const response: JsonObject = {
      contract: "mdlm-assignment-response@1",
      assignment: assignmentId,
      kind: "proposal",
      proposal: {
        outputs: [],
        completionEvidence: { conclusion: exactConclusion },
        loadedSkillRefs: [],
        authoritySupplies: ["stakeholder"],
        standingDelegations: [],
      },
    };
    const source = `${JSON.stringify(response)}\n`;
    const digest = `sha256:${createHash("sha256").update(source).digest("hex")}` as const;
    await journal.captureSubmission({
      assignmentId,
      scenario,
      package: packageIdentity,
      repository: repositoryFingerprint,
      response: { response, source, digest },
    });
    const statuses: MdlmStatus[] = [
      assignmentStatus(true),
      {
        contract: "mdlm-status@1",
        command: "status",
        ok: true,
        currentOutcome: { outcome: "lifecycle-complete" },
        recentTransaction: { available: true, id: executionId },
      },
    ];
    const mdlm = {
      status: vi.fn(async () => statuses.shift()!),
      next: vi.fn(),
      assignment: vi.fn(async () => activeAssignmentState()),
      prepare: vi.fn(async () => packet()),
      prepareSubmission: vi.fn(),
      submit: vi.fn(async (prepared: PreparedAssignmentSubmission) => ({
        contract: "mdlm-scenario-execution@4" as const,
        command: "scenario.submit" as const,
        ok: true,
        execution: executionRecord(prepared.digest),
      })),
      execution: vi.fn(),
      doctor: vi.fn(async () => ({ command: "doctor" as const, ok: true })),
    };
    const assignments = { run: vi.fn() };
    const git = {
      assertClean: vi.fn(async () => undefined),
      head: vi.fn(async () => "base-commit"),
      repositoryFingerprint: baseAdvancementRepository,
      capturePublication,
      publicationCommitState: vi.fn(),
      pendingTransactionIds: vi.fn(async () => []),
      commit: vi.fn(async () => "publication-commit"),
    };
    const io = { progress: vi.fn(), attention: vi.fn(), stopped: vi.fn() };

    await expect(new RunController({ mdlm, assignments, git, io, journal }).run())
      .resolves.toMatchObject({ status: "lifecycle-complete", successful: true });
    expect(assignments.run).not.toHaveBeenCalled();
    expect(mdlm.submit).toHaveBeenCalledWith(
      { response, source, digest },
      expect.any(Object),
    );
    expect(await journal.load()).toBeNull();
  });

  it.each([
    ["selected Process Package", { package: { reference: "other-package@1" } }],
    ["repository fingerprint", { repository: { head: "other-commit" } }],
  ])("stops captured recovery when the %s changed", async (_boundary, changed) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-pi-boundary-"));
    roots.push(root);
    const journal = new RunJournal(path.join(root, "state"));
    const response: JsonObject = { assignment: assignmentId, exact: "captured" };
    const source = `${JSON.stringify(response)}\n`;
    const digest = `sha256:${createHash("sha256").update(source).digest("hex")}` as const;
    await journal.captureSubmission({
      assignmentId,
      scenario,
      package: packageIdentity,
      repository: repositoryFingerprint,
      response: { response, source, digest },
    });
    const state = { ...activeAssignmentState(), ...changed };
    const mdlm = {
      status: vi.fn(),
      next: vi.fn(),
      assignment: vi.fn(async () => state),
      prepare: vi.fn(),
      prepareSubmission: vi.fn(),
      submit: vi.fn(),
      execution: vi.fn(),
      doctor: vi.fn(),
    };

    await expect(new RunController({
      mdlm,
      assignments: { run: vi.fn() },
      git: {
        assertClean: vi.fn(),
        head: vi.fn(),
        repositoryFingerprint: baseAdvancementRepository,
        capturePublication,
        publicationCommitState: vi.fn(),
        pendingTransactionIds: vi.fn(),
        commit: vi.fn(),
      },
      io: { progress: vi.fn(), attention: vi.fn(), stopped: vi.fn() },
      journal,
    }).run()).rejects.toThrow("changed during recovery");
    expect(mdlm.prepare).not.toHaveBeenCalled();
    expect(mdlm.submit).not.toHaveBeenCalled();
  });

  it("retains a terminal Assignment journal so restart cannot allocate replacement work", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-pi-abandoned-"));
    roots.push(root);
    const journal = new RunJournal(path.join(root, "state"));
    const response: JsonObject = { assignment: assignmentId, kind: "unable" };
    const source = `${JSON.stringify(response)}\n`;
    const digest = `sha256:${createHash("sha256").update(source).digest("hex")}` as const;
    await journal.beginSubmission({
      assignmentId,
      scenario,
      package: packageIdentity,
      repository: repositoryFingerprint,
      previousTransactionId: null,
      baseCommit: "base-commit",
      previousMalformedResponseDigests: [],
      response: { response, source, digest },
    });
    const state: AssignmentState = {
      contract: "mdlm-assignment-state@1",
      command: "assignment.show",
      ok: true,
      assignment: { id: assignmentId },
      selected: true,
      package: packageIdentity,
      repository: repositoryFingerprint,
      scenarioReference: scenario,
      disposition: "abandoned",
      retryAvailability: {},
      malformedResponses: [],
      response: { digest },
    };
    const mdlm = {
      status: vi.fn(async () => assignmentStatus(true)),
      next: vi.fn(),
      assignment: vi.fn(async () => state),
      prepare: vi.fn(),
      prepareSubmission: vi.fn(),
      submit: vi.fn(),
      execution: vi.fn(),
      doctor: vi.fn(),
    };
    const dependencies = {
      mdlm,
      assignments: { run: vi.fn() },
      git: {
        assertClean: vi.fn(),
        head: vi.fn(),
        repositoryFingerprint: baseAdvancementRepository,
        capturePublication,
        publicationCommitState: vi.fn(),
        pendingTransactionIds: vi.fn(),
        commit: vi.fn(),
      },
      io: { progress: vi.fn(), attention: vi.fn(), stopped: vi.fn() },
      journal,
    };

    await expect(new RunController(dependencies).run()).resolves.toMatchObject({
      status: "assignment-abandoned",
    });
    await expect(new RunController(dependencies).run()).resolves.toMatchObject({
      status: "assignment-abandoned",
    });
    expect(mdlm.next).not.toHaveBeenCalled();
    expect(await journal.load()).toMatchObject({ phase: "submitting" });
  });

  it.each([
    { boundary: "journaled materializations", firstAlreadyCommitted: false },
    { boundary: "first commit with later materialization pending", firstAlreadyCommitted: true },
  ])("resumes $boundary without duplicating commits or skipping reevaluation", async ({
    firstAlreadyCommitted,
  }) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-pi-advance-boundary-"));
    roots.push(root);
    const journal = new RunJournal(path.join(root, "state"));
    const secondId = "b7fcab68-7094-45db-bfb2-bfa3de4c6c24";
    const digest = `sha256:${"a".repeat(64)}` as const;
    await journal.beginAdvancement({
      package: packageIdentity,
      repository: advancementRepository("base-commit", "a"),
      previousTransactionId: null,
    });
    await journal.recordAdvancementExecutions(await Promise.all([
      capturePublication({
        executionId,
        scenario,
        responseDigest: digest,
        outputPaths: [`.lifecycle/data/.transactions/${executionId}/map.md`],
      }),
      capturePublication({
        executionId: secondId,
        scenario: "second-materialization@1",
        responseDigest: digest,
        outputPaths: [`.lifecycle/data/.transactions/${secondId}/map.md`],
      }),
    ]));
    let currentHead = advancementRepository("base-commit", "a").head;
    if (firstAlreadyCommitted) {
      const repository = advancementRepository("first-materialization-commit", "b");
      currentHead = repository.head;
      await journal.completeAdvancementExecution(executionId, currentHead, repository);
    }
    const status: MdlmStatus = {
      contract: "mdlm-status@1",
      command: "status",
      ok: true,
      package: packageIdentity,
      currentOutcome: {
        outcome: "assignment",
        assignment: { allocation: "not-allocated", id: "stale-projection" },
      },
      recentTransaction: { available: true, id: secondId },
    };
    const mdlm = {
      status: vi.fn(async () => status),
      next: vi.fn(async () => ({
        contract: "mdlm-next@1" as const,
        command: "next" as const,
        ok: true,
        outcome: "lifecycle-complete" as const,
        materializedExecutions: [],
      })),
      assignment: vi.fn(),
      prepare: vi.fn(),
      prepareSubmission: vi.fn(),
      submit: vi.fn(),
      execution: vi.fn(),
      doctor: vi.fn(async () => ({ command: "doctor" as const, ok: true })),
    };
    const committed: string[] = [];
    const git = {
      assertClean: vi.fn(async () => undefined),
      head: vi.fn(async () => currentHead),
      repositoryFingerprint: vi.fn(async () => ({
        head: currentHead,
        trackedState: `sha256:${(
          currentHead === advancementRepository("base-commit", "a").head
            ? "a"
            : currentHead === advancementRepository("first-materialization-commit", "b").head
              ? "b"
              : "c"
        ).repeat(64)}` as const,
      })),
      capturePublication,
      publicationCommitState: vi.fn(),
      pendingTransactionIds: vi.fn(async () => []),
      commit: vi.fn(async (publication: { executionId: string }) => {
        committed.push(publication.executionId);
        currentHead = advancementRepository(
          publication.executionId === executionId
            ? "first-materialization-commit"
            : "second-materialization-commit",
          publication.executionId === executionId ? "b" : "c",
        ).head;
        return currentHead;
      }),
    };
    const controller = new RunController({
      mdlm,
      assignments: { run: vi.fn() },
      git,
      io: { progress: vi.fn(), attention: vi.fn(), stopped: vi.fn() },
      journal,
    });

    await expect(controller.run()).resolves.toMatchObject({
      status: "lifecycle-complete",
      successful: true,
    });
    expect(committed).toEqual(firstAlreadyCommitted
      ? [secondId]
      : [executionId, secondId]);
    expect(mdlm.next).toHaveBeenCalledTimes(1);
    expect(mdlm.prepare).not.toHaveBeenCalled();
    expect(await journal.load()).toBeNull();
  });

  it("stops on contradictory interrupted advancement facts", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-pi-advance-ambiguity-"));
    roots.push(root);
    const journal = new RunJournal(path.join(root, "state"));
    await journal.beginAdvancement({
      package: packageIdentity,
      repository: advancementRepository("base-commit", "a"),
      previousTransactionId: null,
    });
    expect(await journal.load()).toMatchObject({
      phase: "advancing",
      advancement: { purpose: "ordinary-allocation" },
    });
    const mdlm = {
      status: vi.fn(async () => ({
        ...assignmentStatus(false),
        recentTransaction: { available: true, id: executionId },
      })),
      next: vi.fn(),
      assignment: vi.fn(),
      prepare: vi.fn(),
      prepareSubmission: vi.fn(),
      submit: vi.fn(),
      execution: vi.fn(),
      doctor: vi.fn(),
    };
    const controller = new RunController({
      mdlm,
      assignments: { run: vi.fn() },
      git: {
        assertClean: vi.fn(),
        head: vi.fn(async () => advancementRepository("base-commit", "a").head),
        repositoryFingerprint: baseAdvancementRepository,
        capturePublication,
        publicationCommitState: vi.fn(),
        pendingTransactionIds: vi.fn(async () => []),
        commit: vi.fn(),
      },
      io: { progress: vi.fn(), attention: vi.fn(), stopped: vi.fn() },
      journal,
    });

    await expect(controller.run()).rejects.toThrow(
      "changed recent transaction without visible transaction files",
    );
    expect(mdlm.next).not.toHaveBeenCalled();
    expect(await journal.load()).toMatchObject({ phase: "advancing" });
  });

  it("stops when interrupted multi-transaction materialization order was not journaled", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-pi-advance-order-"));
    roots.push(root);
    const journal = new RunJournal(path.join(root, "state"));
    await journal.beginAdvancement({
      package: packageIdentity,
      repository: advancementRepository("base-commit", "a"),
      previousTransactionId: null,
    });
    const firstId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const secondId = "00000000-0000-4000-8000-000000000000";
    const digest = `sha256:${"a".repeat(64)}` as const;
    const statuses: MdlmStatus[] = [
      {
        ...assignmentStatus(false),
        recentTransaction: { available: true, id: secondId },
      },
      {
        contract: "mdlm-status@1",
        command: "status",
        ok: true,
        currentOutcome: { outcome: "lifecycle-complete" },
        recentTransaction: { available: true, id: secondId },
      },
    ];
    const mdlm = {
      status: vi.fn(async () => statuses.shift()!),
      next: vi.fn(),
      assignment: vi.fn(),
      prepare: vi.fn(),
      prepareSubmission: vi.fn(),
      submit: vi.fn(),
      execution: vi.fn(async (id: string) => ({
        ok: true as const,
        command: "scenario.execution.show" as const,
        execution: {
          ...executionRecord(digest),
          id,
          outputs: [{
            lifecycleDatum: {
              path: `.lifecycle/data/.transactions/${id}/map.md`,
            },
          }],
        },
      })),
      doctor: vi.fn(async () => ({ command: "doctor" as const, ok: true })),
    };
    const git = {
      assertClean: vi.fn(async () => undefined),
      head: vi.fn(async () => advancementRepository("base-commit", "a").head),
      repositoryFingerprint: baseAdvancementRepository,
      capturePublication,
      publicationCommitState: vi.fn(),
      pendingTransactionIds: vi.fn(async () => [secondId, firstId]),
      commit: vi.fn(async () => "materialization-commit"),
    };
    const controller = new RunController({
      mdlm,
      assignments: { run: vi.fn() },
      git,
      io: { progress: vi.fn(), attention: vi.fn(), stopped: vi.fn() },
      journal,
    });

    await expect(controller.run()).rejects.toThrow(
      "materialization order cannot be proven",
    );
    expect(git.commit).not.toHaveBeenCalled();
    expect(await journal.load()).toMatchObject({ phase: "advancing" });
  });

  it("stops when restart loses the session that produced a malformed response", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-pi-correction-"));
    roots.push(root);
    const journal = new RunJournal(path.join(root, "state"));
    const malformedResponse: JsonObject = { assignment: assignmentId, malformed: true };
    const malformedSource = `${JSON.stringify(malformedResponse)}\n`;
    const malformedDigest = `sha256:${createHash("sha256").update(malformedSource).digest("hex")}` as const;
    await journal.beginSubmission({
      assignmentId,
      scenario,
      package: packageIdentity,
      repository: repositoryFingerprint,
      previousTransactionId: null,
      baseCommit: "base-commit",
      previousMalformedResponseDigests: [],
      response: { response: malformedResponse, source: malformedSource, digest: malformedDigest },
    });
    const state = {
      contract: "mdlm-assignment-state@1" as const,
      ok: true,
      command: "assignment.show" as const,
      assignment: { id: assignmentId },
      selected: true as const,
      package: packageIdentity,
      repository: repositoryFingerprint,
      scenarioReference: scenario,
      disposition: "active" as const,
      retryAvailability: { malformedResponseCorrection: 0 },
      malformedResponses: [{ digest: malformedDigest, diagnostics: [{ code: "FIX", message: "Fix it" }] }],
    };
    const statuses: MdlmStatus[] = [
      assignmentStatus(true),
      assignmentStatus(true),
      assignmentStatus(true),
      {
        contract: "mdlm-status@1",
        command: "status",
        ok: true,
        currentOutcome: { outcome: "lifecycle-complete" },
        recentTransaction: { available: true, id: executionId },
      },
    ];
    const mdlm = {
      status: vi.fn(async () => statuses.shift()!),
      next: vi.fn(),
      assignment: vi.fn(async () => state),
      prepare: vi.fn(async () => packet()),
      prepareSubmission: vi.fn((value: JsonObject): PreparedAssignmentSubmission => {
        const source = `${JSON.stringify(value)}\n`;
        return {
          response: value,
          source,
          digest: `sha256:${createHash("sha256").update(source).digest("hex")}`,
        };
      }),
      submit: vi.fn(async (prepared: PreparedAssignmentSubmission) => ({
        contract: "mdlm-scenario-execution@4" as const,
        command: "scenario.submit" as const,
        ok: true,
        execution: executionRecord(prepared.digest),
      })),
      execution: vi.fn(),
      doctor: vi.fn(async () => ({ command: "doctor" as const, ok: true })),
    };
    const assignments = { run: vi.fn() };
    const git = {
      assertClean: vi.fn(async () => undefined),
      head: vi.fn(async () => "base-commit"),
      repositoryFingerprint: baseAdvancementRepository,
      capturePublication,
      publicationCommitState: vi.fn(),
      pendingTransactionIds: vi.fn(async () => []),
      commit: vi.fn(async () => "publication-commit"),
    };
    const io = { progress: vi.fn(), attention: vi.fn(), stopped: vi.fn() };

    const controller = new RunController({ mdlm, assignments, git, io, journal });
    await expect(controller.run()).resolves.toMatchObject({
      status: "assignment-correction-session-lost",
      successful: false,
      details: { assignment: { id: assignmentId }, responseDigest: malformedDigest },
    });
    expect(assignments.run).not.toHaveBeenCalled();
    expect(mdlm.submit).not.toHaveBeenCalled();
    expect(await journal.load()).toMatchObject({ phase: "submitting" });
  });

  it("resumes commit after doctor passed and clears the durable journal", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-pi-doctor-recovery-"));
    roots.push(root);
    const journal = new RunJournal(path.join(root, "state"));
    const response: JsonObject = { assignment: assignmentId, complete: true };
    const source = `${JSON.stringify(response)}\n`;
    const digest = `sha256:${createHash("sha256").update(source).digest("hex")}` as const;
    await journal.beginSubmission({
      assignmentId,
      scenario,
      package: packageIdentity,
      repository: repositoryFingerprint,
      previousTransactionId: null,
      baseCommit: "base-commit",
      previousMalformedResponseDigests: [],
      response: { response, source, digest },
    });
    await journal.recordPublication({
      executionId,
      scenario,
      responseDigest: digest,
      outputPaths: [
        `.lifecycle/data/.transactions/${executionId}/execution.json`,
        `.lifecycle/data/.transactions/${executionId}/map.md`,
      ],
      blobs: [
        { path: `.lifecycle/data/.transactions/${executionId}/execution.json`, oid: "a".repeat(40) },
        { path: `.lifecycle/data/.transactions/${executionId}/map.md`, oid: "b".repeat(40) },
      ],
    });
    await journal.recordDoctorPassed();
    const mdlm = {
      status: vi.fn(async () => ({
        contract: "mdlm-status@1" as const,
        command: "status" as const,
        ok: true,
        currentOutcome: { outcome: "lifecycle-complete" },
        recentTransaction: { available: true, id: executionId },
      })),
      next: vi.fn(),
      assignment: vi.fn(),
      prepare: vi.fn(),
      prepareSubmission: vi.fn(),
      submit: vi.fn(),
      execution: vi.fn(),
      doctor: vi.fn(),
    };
    const git = {
      assertClean: vi.fn(async () => undefined),
      head: vi.fn(),
      repositoryFingerprint: baseAdvancementRepository,
      capturePublication,
      publicationCommitState: vi.fn(),
      pendingTransactionIds: vi.fn(async () => []),
      commit: vi.fn(async () => "recovered-commit"),
    };
    const io = { progress: vi.fn(), attention: vi.fn(), stopped: vi.fn() };
    const controller = new RunController({
      mdlm,
      assignments: { run: vi.fn() },
      git,
      io,
      journal,
    });

    await expect(controller.run()).resolves.toMatchObject({ status: "lifecycle-complete" });
    expect(mdlm.doctor).not.toHaveBeenCalled();
    expect(git.commit).toHaveBeenCalledWith(
      expect.objectContaining({ executionId, responseDigest: digest }),
      "base-commit",
    );
    expect(await journal.load()).toBeNull();
  });

  it("does not retry a hidden journaled submission child while it is alive", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-pi-live-submit-"));
    roots.push(root);
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      stdio: "ignore",
    });
    const childPid = child.pid;
    if (childPid === undefined) throw new Error("Submission fixture did not start");
    onTestFinished(() => { child.kill("SIGTERM"); });
    const journal = new RunJournal(path.join(root, "state"));
    const response: JsonObject = { assignment: assignmentId, complete: true };
    const source = `${JSON.stringify(response)}\n`;
    const digest = `sha256:${createHash("sha256").update(source).digest("hex")}` as const;
    await journal.beginSubmission({
      assignmentId,
      scenario,
      package: packageIdentity,
      repository: repositoryFingerprint,
      previousTransactionId: null,
      baseCommit: "base-commit",
      previousMalformedResponseDigests: [],
      response: { response, source, digest },
    });
    await journal.recordSubmissionProcess({
      id: "live-attempt",
      pid: childPid,
      stdoutPath: path.join(root, "state", "attempts", "live.stdout"),
      stderrPath: path.join(root, "state", "attempts", "live.stderr"),
    });
    const mdlm = {
      status: vi.fn(),
      next: vi.fn(),
      assignment: vi.fn(),
      prepare: vi.fn(),
      prepareSubmission: vi.fn(),
      submit: vi.fn(),
      execution: vi.fn(),
      doctor: vi.fn(),
    };
    const io = { progress: vi.fn(), attention: vi.fn(), stopped: vi.fn() };
    const controller = new RunController({
      mdlm,
      assignments: { run: vi.fn() },
      git: {
        assertClean: vi.fn(),
        head: vi.fn(),
        repositoryFingerprint: baseAdvancementRepository,
        capturePublication,
        publicationCommitState: vi.fn(),
        pendingTransactionIds: vi.fn(),
        commit: vi.fn(),
      },
      io,
      journal,
    });

    await expect(controller.run()).resolves.toMatchObject({
      status: "submission-child-active",
      successful: false,
      details: { pid: childPid, stdoutPath: expect.any(String), stderrPath: expect.any(String) },
    });
    expect(mdlm.status).not.toHaveBeenCalled();
    expect(mdlm.submit).not.toHaveBeenCalled();
    expect(await journal.load()).toMatchObject({
      phase: "submitting",
      submission: { process: { pid: childPid } },
    });
  });

  it("reconciles publication after an interrupted submit before doctor and commit", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-pi-recovery-"));
    roots.push(root);
    const journal = new RunJournal(path.join(root, "state"));
    const response: JsonObject = {
      contract: "mdlm-assignment-response@1",
      assignment: assignmentId,
      kind: "proposal",
      proposal: {},
    };
    const source = `${JSON.stringify(response)}\n`;
    const digest = `sha256:${createHash("sha256").update(source).digest("hex")}` as const;
    await journal.beginSubmission({
      assignmentId,
      scenario,
      package: packageIdentity,
      repository: repositoryFingerprint,
      previousTransactionId: null,
      baseCommit: "base-commit",
      previousMalformedResponseDigests: [],
      response: { response, source, digest },
    });

    const status = vi.fn()
      .mockResolvedValueOnce({
        contract: "mdlm-status@1",
        command: "status",
        ok: true,
        currentOutcome: { outcome: "assignment", assignment: { allocation: "not-allocated" } },
        recentTransaction: { available: true, id: executionId },
      } satisfies MdlmStatus)
      .mockResolvedValueOnce({
        contract: "mdlm-status@1",
        command: "status",
        ok: true,
        currentOutcome: { outcome: "lifecycle-complete", explanation: "done" },
        recentTransaction: { available: true, id: executionId },
      } satisfies MdlmStatus);
    const execution = executionRecord(digest);
    const mdlm = {
      status,
      next: vi.fn(),
      assignment: vi.fn(),
      prepare: vi.fn(),
      prepareSubmission: vi.fn(),
      submit: vi.fn(),
      execution: vi.fn(async () => ({
        contract: "mdlm-scenario-execution@4" as const,
        ok: true as const,
        command: "scenario.execution.show" as const,
        execution,
      })),
      doctor: vi.fn(async () => ({ command: "doctor" as const, ok: true })),
    };
    const git = {
      assertClean: vi.fn(async () => undefined),
      head: vi.fn(),
      repositoryFingerprint: baseAdvancementRepository,
      capturePublication,
      publicationCommitState: vi.fn(),
      pendingTransactionIds: vi.fn(async () => []),
      commit: vi.fn(async () => "publication-commit"),
    };
    const io = { progress: vi.fn(), attention: vi.fn(), stopped: vi.fn() };
    const controller = new RunController({
      mdlm,
      git,
      io,
      assignments: { run: vi.fn() },
      journal,
    });

    await expect(controller.run()).resolves.toMatchObject({
      status: "lifecycle-complete",
      successful: true,
    });
    expect(mdlm.execution).toHaveBeenCalledWith(executionId);
    expect(mdlm.submit).not.toHaveBeenCalled();
    expect(mdlm.doctor).toHaveBeenCalledTimes(1);
    expect(git.commit).toHaveBeenCalledWith(
      expect.objectContaining({ executionId, responseDigest: digest }),
      "base-commit",
    );
    expect(await journal.load()).toBeNull();
  });
});

async function materializationReevaluationJournal(journal: RunJournal): Promise<void> {
  const digest = `sha256:${"a".repeat(64)}` as const;
  await journal.beginAdvancement({
    package: packageIdentity,
    repository: advancementRepository("base-commit", "a"),
    previousTransactionId: null,
  });
  await journal.recordAdvancementExecutions([await capturePublication({
    executionId,
    scenario,
    responseDigest: digest,
    outputPaths: [`.lifecycle/data/.transactions/${executionId}/map.md`],
  })]);
  const repository = advancementRepository("materialization-commit", "b");
  await journal.completeAdvancementExecution(
    executionId,
    repository.head,
    repository,
  );
}

function advancementRepository(head: string, digestCharacter: string) {
  const aliases: Record<string, string> = {
    "base-commit": "1".repeat(40),
    "materialization-commit": "2".repeat(40),
    "assignment-commit": "3".repeat(40),
    "external-clean-commit": "4".repeat(40),
    "first-materialization-commit": "5".repeat(40),
    "second-materialization-commit": "6".repeat(40),
  };
  return {
    head: aliases[head] ?? head,
    trackedState: `sha256:${digestCharacter.repeat(64)}` as const,
  };
}

async function baseAdvancementRepository() {
  return advancementRepository("base-commit", "a");
}

async function capturePublication(publication: UncapturedPublicationEvidence) {
  return {
    ...publication,
    blobs: publication.outputPaths.map((outputPath) => ({
      path: outputPath,
      oid: "a".repeat(40),
    })),
  };
}

function activeAssignmentState(): Extract<AssignmentState, { selected: true }> {
  return {
    contract: "mdlm-assignment-state@1",
    ok: true,
    command: "assignment.show",
    assignment: { id: assignmentId },
    selected: true,
    package: packageIdentity,
    repository: repositoryFingerprint,
    scenarioReference: scenario,
    disposition: "active",
    retryAvailability: { malformedResponseCorrection: 1 },
    malformedResponses: [],
  };
}

function assignmentStatus(active: boolean): MdlmStatus {
  return {
    contract: "mdlm-status@1",
    command: "status",
    ok: true,
    package: packageIdentity,
    currentOutcome: {
      outcome: "assignment",
      assignment: active
        ? { allocation: "active", id: assignmentId }
        : { allocation: "not-allocated" },
    },
    recentTransaction: { available: false },
  };
}

function executionRecord(digest: `sha256:${string}`): JsonObject & {
  contract: "mdlm-scenario-execution@4";
  id: string;
  status: string;
} {
  return {
    contract: "mdlm-scenario-execution@4",
    id: executionId,
    status: "completed",
    definition: { scenario },
    response: { assignment: assignmentId, digest },
    outputs: [{
      lifecycleDatum: {
        path: `.lifecycle/data/.transactions/${executionId}/map.md`,
      },
    }],
  };
}

function packet(id = assignmentId): AssignmentPacket {
  return {
    contract: "mdlm-assignment-packet@2",
    ok: true,
    command: "scenario.prepare",
    assignment: { id },
    package: packageIdentity,
    repository: repositoryFingerprint,
    scenario: { reference: scenario },
    prompt: { exact: "complete it", skills: [] },
    responseSchema: {},
  } as AssignmentPacket;
}

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
  MdlmStatus,
  PreparedAssignmentSubmission,
} from "../src/mdlm-client.js";
import { RunController } from "../src/run-controller.js";
import { RunJournal } from "../src/run-journal.js";

const assignmentId = "3dae4ec3-2aae-444d-87a5-89c6dc4af3fc";
const executionId = "aef8da80-ce4b-420b-afa5-331a06860683";
const scenario = "example@1";

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

  it("commits automatic materialization before reevaluating instead of using its stale lease", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-pi-advance-"));
    roots.push(root);
    const journal = new RunJournal(path.join(root, "state"));
    const digest = `sha256:${"a".repeat(64)}` as const;
    const statuses: MdlmStatus[] = [
      assignmentStatus(false),
      {
        contract: "mdlm-status@1",
        command: "status",
        ok: true,
        currentOutcome: { outcome: "lifecycle-complete", explanation: "done" },
        recentTransaction: { available: true, id: executionId },
      },
    ];
    const mdlm = {
      status: vi.fn(async () => statuses.shift()!),
      next: vi.fn(async () => ({
        contract: "mdlm-next@1" as const,
        command: "next" as const,
        ok: true,
        outcome: "assignment" as const,
        assignment: { id: "pre-commit-stale-assignment" },
        materializedExecutions: [{ id: executionId, scenario, status: "completed" as const }],
      })),
      assignment: vi.fn(),
      prepare: vi.fn(),
      prepareSubmission: vi.fn(),
      submit: vi.fn(),
      execution: vi.fn(async () => ({
        ok: true as const,
        command: "scenario.execution.show" as const,
        execution: executionRecord(digest),
      })),
      doctor: vi.fn(async () => ({ command: "doctor" as const, ok: true })),
    };
    const git = {
      assertClean: vi.fn(async () => undefined),
      head: vi.fn(async () => "base-commit"),
      publicationCommitState: vi.fn(),
      pendingTransactionIds: vi.fn(async () => [executionId]),
      commit: vi.fn(async () => "materialization-commit"),
    };
    const io = { progress: vi.fn(), attention: vi.fn(), stopped: vi.fn() };
    const controller = new RunController({
      mdlm,
      assignments: { run: vi.fn() },
      git,
      io,
      journal,
    });

    await expect(controller.run()).resolves.toMatchObject({
      status: "lifecycle-complete",
      successful: true,
    });
    expect(git.commit).toHaveBeenCalledWith(
      expect.objectContaining({ executionId, responseDigest: digest }),
      "base-commit",
      [],
    );
    expect(mdlm.doctor).toHaveBeenCalledTimes(1);
    expect(mdlm.status).toHaveBeenCalledTimes(2);
    expect(mdlm.assignment).not.toHaveBeenCalled();
    expect(mdlm.prepare).not.toHaveBeenCalled();
    expect(await journal.load()).toBeNull();
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
          conclusion: attendedAnswer,
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

  it("recovers a recorded malformed response by correcting the same durable Assignment", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-pi-correction-"));
    roots.push(root);
    const journal = new RunJournal(path.join(root, "state"));
    const malformedResponse: JsonObject = { assignment: assignmentId, malformed: true };
    const malformedSource = `${JSON.stringify(malformedResponse)}\n`;
    const malformedDigest = `sha256:${createHash("sha256").update(malformedSource).digest("hex")}` as const;
    await journal.beginSubmission({
      assignmentId,
      scenario,
      previousTransactionId: null,
      baseCommit: "base-commit",
      previousMalformedResponseDigests: [],
      response: { response: malformedResponse, source: malformedSource, digest: malformedDigest },
    });
    const correctedResponse: JsonObject = {
      contract: "mdlm-assignment-response@1",
      assignment: assignmentId,
      kind: "proposal",
      proposal: { corrected: true },
    };
    const state = {
      contract: "mdlm-assignment-state@1" as const,
      ok: true,
      command: "assignment.show" as const,
      assignment: { id: assignmentId },
      selected: true as const,
      scenarioReference: scenario,
      disposition: "active" as const,
      retryAvailability: { malformedResponseCorrection: 0 },
      malformedResponses: [{ digest: malformedDigest, diagnostics: [{ code: "FIX", message: "Fix it" }] }],
    };
    const statuses: MdlmStatus[] = [
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
    const assignments = {
      run: vi.fn(async (_packet: AssignmentPacket, options?: { correction?: { previousResponse: JsonObject } }) => {
        expect(options?.correction?.previousResponse).toEqual(malformedResponse);
        return correctedResponse;
      }),
    };
    const git = {
      assertClean: vi.fn(async () => undefined),
      head: vi.fn(async () => "base-commit"),
      publicationCommitState: vi.fn(),
      pendingTransactionIds: vi.fn(async () => []),
      commit: vi.fn(async () => "publication-commit"),
    };
    const io = { progress: vi.fn(), attention: vi.fn(), stopped: vi.fn() };

    const controller = new RunController({ mdlm, assignments, git, io, journal });
    await expect(controller.run()).resolves.toMatchObject({
      status: "lifecycle-complete",
      successful: true,
    });
    expect(assignments.run).toHaveBeenCalledTimes(1);
    expect(mdlm.submit).toHaveBeenCalledTimes(1);
    expect(await journal.load()).toBeNull();
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
      previousTransactionId: null,
      baseCommit: "base-commit",
      previousMalformedResponseDigests: [],
      response: { response, source, digest },
    });
    await journal.recordPublication({
      executionId,
      scenario,
      responseDigest: digest,
      outputPaths: [`.lifecycle/data/.transactions/${executionId}/map.md`],
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

function activeAssignmentState(): Extract<AssignmentState, { selected: true }> {
  return {
    contract: "mdlm-assignment-state@1",
    ok: true,
    command: "assignment.show",
    assignment: { id: assignmentId },
    selected: true,
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
    scenario: { reference: scenario },
    prompt: { exact: "complete it", skills: [] },
    responseSchema: {},
  } as AssignmentPacket;
}

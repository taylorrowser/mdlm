import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { RunController } from "../src/run-controller.js";
import { RunJournal } from "../src/run-journal.js";
import type { JsonObject } from "../src/mdlm-client.js";

const transport = { repository: "/repo", command: { program: "mdlm", arguments: [] } };
const boundary = { package: { reference: "package@1" }, snapshot: "base", transport };
const guidance: JsonObject = { contract: "mdlm-direct-guidance@1", action: "second", package: boundary.package, snapshot: "base", inputs: {}, candidates: [], payloadSchemas: {}, prompt: "Author useful data" };
function prepared(proposal: JsonObject) {
  const source = `${JSON.stringify(proposal)}\n`;
  return { proposal, source, digest: `sha256:${createHash("sha256").update(source).digest("hex")}` as const };
}
async function harness() {
  const journal = new RunJournal(await mkdtemp(path.join(os.tmpdir(), "mdlm-direct-loop-")));
  return {
    mdlm: {
      identity: () => transport,
      discover: vi.fn(async (): Promise<JsonObject> => ({ contract: "mdlm-expectations@2", outcome: "work-available", items: [{ action: "first" }, { action: "second" }], optional: [] })),
      guidance: vi.fn(async () => guidance), prepareSubmission: prepared,
      submit: vi.fn(async (p: ReturnType<typeof prepared>, _authority?: string): Promise<JsonObject> => ({ ok: true, contract: "mdlm-proposal-result@2", operation: p.proposal.operation!, proposalDigest: p.digest, outcome: "accepted" })),
      settlement: vi.fn(async (_operation: string): Promise<JsonObject> => ({})),
      execute: vi.fn(async (_subject: string, _operation: string): Promise<JsonObject> => ({})),
      executionSettlement: vi.fn(async (_operation: string): Promise<JsonObject> => ({})),
    },
    worker: { run: vi.fn().mockResolvedValueOnce({ action: "second" }).mockResolvedValueOnce({ candidates: [] }), close: vi.fn(async () => {}) },
    io: { progress: vi.fn(), attention: vi.fn(async () => ({ conclusion: "approve" })), stopped: vi.fn() }, journal,
  };
}

describe("direct operator loop", () => {
  it("lets the agent choose the second available action and submits exact context", async () => {
    const deps = await harness();
    await expect(new RunController(deps).run()).resolves.toMatchObject({ status: "accepted", successful: true });
    expect(deps.mdlm.guidance).toHaveBeenCalledWith("second", undefined);
    expect(deps.mdlm.submit.mock.calls[0]![0].proposal).toMatchObject({ action: "second", package: boundary.package, snapshot: "base", candidates: [] });
    expect(deps.mdlm.discover).toHaveBeenCalledOnce();
    expect(await deps.journal.load()).toBeNull();
  });
  it("supplies stakeholder authority from attended IO and rejects invented authority", async () => {
    const deps = await harness();
    deps.mdlm.guidance.mockResolvedValue({ ...guidance, authority: { kind: "stakeholder", name: "stakeholder" } });
    await new RunController(deps).run();
    expect(deps.io.attention).toHaveBeenCalledOnce();
    expect(deps.mdlm.submit.mock.calls[0]![1]).toBe("stakeholder");
    expect(deps.mdlm.submit.mock.calls[0]![0].proposal.evidence).toEqual({ authority: ["stakeholder"] });
    const forged = await harness();
    forged.worker.run.mockReset().mockResolvedValueOnce({ action: "second" }).mockResolvedValueOnce({ candidates: [], evidence: { authority: ["stakeholder"] } });
    await expect(new RunController(forged).run()).rejects.toThrow("unsupported evidence or authority");
    expect(forged.mdlm.submit).not.toHaveBeenCalled();
  });
  it("settles a lost accepted response without discovery, agent work or replay", async () => {
    const deps = await harness();
    const digest = `sha256:${"a".repeat(64)}` as const;
    await deps.journal.capture("op", digest, boundary);
    await deps.journal.beginSubmission();
    deps.mdlm.settlement.mockResolvedValue({ ok: true, contract: "mdlm-proposal-result@2", operation: "op", proposalDigest: digest, outcome: "accepted" });
    await expect(new RunController(deps).run()).resolves.toMatchObject({ status: "accepted" });
    expect(deps.mdlm.settlement).toHaveBeenCalledWith("op");
    expect(deps.mdlm.discover).not.toHaveBeenCalled();
    expect(deps.worker.run).not.toHaveBeenCalled();
    expect(deps.mdlm.submit).not.toHaveBeenCalled();
  });
  it("preserves pending publication on mismatched settlement bytes", async () => {
    const deps = await harness();
    await deps.journal.capture("op", `sha256:${"a".repeat(64)}`, boundary);
    await deps.journal.beginSubmission();
    deps.mdlm.settlement.mockResolvedValue({ ok: true, contract: "mdlm-proposal-result@2", operation: "op", proposalDigest: "wrong", outcome: "accepted" });
    await expect(new RunController(deps).run()).rejects.toThrow("pending proposal bytes");
    expect(await deps.journal.load()).toMatchObject({ phase: "submitting" });
  });
  it("reports independent review without authoring its own verdict", async () => {
    const deps = await harness();
    deps.mdlm.guidance.mockResolvedValue({ ...guidance, authority: { kind: "independent-review", name: "reviewer" } });
    await expect(new RunController(deps).run()).resolves.toMatchObject({ status: "independent-review-required", successful: false });
    expect(deps.worker.run).toHaveBeenCalledOnce();
    expect(deps.mdlm.submit).not.toHaveBeenCalled();
  });
  it("passes actual execution evidence to the author before publishing its assessment", async () => {
    const deps = await harness();
    deps.mdlm.guidance.mockResolvedValue({ ...guidance, executionCommand: "mdlm execution run IMP-A-r00001 <operation> --json", executionSubject: "IMP-A-r00001", evidence: [] });
    deps.mdlm.execute.mockImplementation(async (_subject, operation) => ({ ok: true, contract: "mdlm-execution-result@1", operation, value: { receipt: { state: "completed", stdout: "observed output" }, evidence: "git-blob:receipt" } }));
    await expect(new RunController(deps).run()).resolves.toMatchObject({ status: "accepted" });
    expect(deps.mdlm.execute).toHaveBeenCalledWith("IMP-A-r00001", expect.any(String));
    expect(deps.worker.run.mock.calls[1]![0].context.execution.value.receipt.stdout).toBe("observed output");
    expect(deps.io.stopped).toHaveBeenCalledOnce();
  });
  it("preserves a rejected proposal until settlement proves nonpublication", async () => {
    const deps = await harness();
    deps.mdlm.submit.mockResolvedValue({ ok: false, diagnostics: [{ code: "invalid" }] });
    await expect(new RunController(deps).run()).resolves.toMatchObject({ status: "rejected" });
    const pending = (await deps.journal.load())!;
    deps.mdlm.settlement.mockResolvedValue({ ok: true, contract: "mdlm-proposal-result@2", operation: pending.operation, outcome: "not-published" });
    await expect(new RunController(deps).run()).resolves.toMatchObject({ status: "not-published" });
    expect(deps.mdlm.discover).toHaveBeenCalledOnce();
    expect(await deps.journal.load()).toBeNull();
  });
  it("clears an execution proven not started before a later invocation discovers work", async () => {
    const deps = await harness();
    await deps.journal.capture("exec-not-started", `sha256:${"0".repeat(64)}`, boundary, "execution");
    await deps.journal.beginSubmission();
    deps.mdlm.executionSettlement.mockResolvedValue({ ok: true, contract: "mdlm-execution-result@1", operation: "exec-not-started", value: { state: "not-started" } });
    await expect(new RunController(deps).run()).resolves.toMatchObject({ status: "not-started", successful: false });
    expect(await deps.journal.load()).toBeNull();
    expect(deps.mdlm.discover).not.toHaveBeenCalled();
    expect(deps.mdlm.execute).not.toHaveBeenCalled();
    await expect(new RunController(deps).run()).resolves.toMatchObject({ status: "accepted" });
    expect(deps.mdlm.discover).toHaveBeenCalledOnce();
  });
  it("retains an ambiguous execution and settles without running it again", async () => {
    const deps = await harness();
    await deps.journal.capture("exec", `sha256:${"0".repeat(64)}`, boundary, "execution");
    await deps.journal.beginSubmission();
    deps.mdlm.executionSettlement.mockResolvedValue({ ok: true, contract: "mdlm-execution-result@1", operation: "exec", value: { state: "started" } });
    await expect(new RunController(deps).run()).resolves.toMatchObject({ status: "settlement-required" });
    expect(await deps.journal.load()).toMatchObject({ kind: "execution" });
    expect(deps.mdlm.execute).not.toHaveBeenCalled();
  });
});

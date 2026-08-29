import { createHash } from "node:crypto";
import { constants as fsConstants, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { executeCommandApplication } from "../src/command-application.js";
import { deriveOperatorOutcome } from "../src/assignment.js";
import { loadProcessPackage } from "../src/index.js";
import { initialPhaseId } from "../src/lifecycle-inspection.js";
import { classifyOperatorOutcome, type OperatorWorkFacts } from "../src/operator-outcome.js";
import { loadRepositoryInspection } from "../src/repository-inspection.js";
import { validateScenarioContracts } from "../src/scenario-contract.js";
import { scenarioOutputContractDiagnostics } from "../src/scenario-execution.js";
import { selectedRepositoryPackage } from "../src/selected-package.js";

type JsonObject = Record<string, any>;

async function command(repository: string, arguments_: string[], input?: string) {
  const result = await executeCommandApplication(arguments_, repository, input);
  return {
    status: result.exitCode,
    value: JSON.parse(result.output) as JsonObject,
  };
}

async function filesDigest(root: string): Promise<string> {
  const entries: [string, string][] = [];
  async function visit(directory: string): Promise<void> {
    try {
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) await visit(absolute);
        else entries.push([
          path.relative(root, absolute),
          (await fs.readFile(absolute)).toString("base64"),
        ]);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  await visit(root);
  return createHash("sha256")
    .update(JSON.stringify(entries.sort(([left], [right]) => left.localeCompare(right))))
    .digest("hex");
}

async function transactionCount(repository: string): Promise<number> {
  try {
    return (await fs.readdir(path.join(repository, ".lifecycle/data/.transactions"))).length;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
}

function responseFrom(next: JsonObject): JsonObject {
  const scaffold = structuredClone(next.assignment.packet.responseScaffold);
  const payloads: Record<string, Record<string, unknown>> = {
    map: {
      title: "Fault gate wayfinding map",
      purpose: "Exercise the exact v2 claim and submission boundary.",
      frontier: ["product-intent", "questions"],
    },
    product_intent: {
      title: "Fault gate product intent",
      kind: "preferential",
      intent_scope: "product",
      question: "Which exact outcome should this repository pursue?",
      state: "open",
      blocking_impact: "The package cannot compile product intent without an answer.",
    },
    questions: {
      title: "Fault gate evidence question",
      kind: "empirical",
      question: "Which repository evidence bounds this outcome?",
      state: "open",
      blocking_impact: "No evidence claim should be inferred without an answer.",
    },
  };
  scaffold.proposal.outputs = scaffold.proposal.outputs.map((output: JsonObject) => ({
    ...output,
    payload: payloads[output.handle],
    body: `# ${output.handle}\n`,
  }));
  scaffold.proposal.completionEvidence = {
    summary: "The exact initial decision frontier is explicit.",
  };
  return scaffold;
}

function filledResponse(next: JsonObject): JsonObject {
  if (next.assignment.packet.scenario.reference === "establish-initial-wayfinding-map@2") {
    return responseFrom(next);
  }
  const packet = next.assignment.packet;
  const response = structuredClone(packet.responseScaffold);
  if (packet.scenario.reference === "freeze-source-boundary@1") {
    const source = packet.exactInputs[0].inputs.find(
      (input: JsonObject) => input.name === "source",
    ).values[0];
    response.proposal.outputs[0].payload = {
      title: `Source boundary for ${source.identity.revision_id}`,
      kind: "source-boundary",
      role: "source-boundary",
      scope: source.identity.revision_id,
      group: "SAME-LINEAGE",
      definition_members: [source.identity.revision_id],
      evidence: [],
    };
    response.proposal.outputs[0].body = "The exact source Revision is frozen.\n";
  } else if (packet.scenario.reference === "resolve-question@2") {
    const question = packet.exactInputs[0].inputs.find(
      (input: JsonObject) => input.name === "question",
    ).values[0];
    const answer = "Build the exact fault-injection acceptance gate.";
    for (const output of response.proposal.outputs) {
      if (output.handle === "updated_question") {
        output.payload = {
          ...question.data.payload,
          state: "answered",
          attended_answer: answer,
        };
        output.body = "The stakeholder supplied the exact answer.\n";
      } else if (output.handle === "decision") {
        output.payload = {
          title: "Resolve the exact product-intent question",
          kind: "scope",
          rationale: "The attended answer fixes the selected outcome.",
          decision: answer,
          alternatives: ["Leave the question open."],
          effective_scope: "$proposal.updated_question.revision_id",
        };
        output.body = "The attended answer authorizes this exact scope.\n";
      }
    }
  } else {
    throw new Error(`No focused response for ${packet.scenario.reference}`);
  }
  response.proposal.completionEvidence = { summary: "Focused fault-gate response." };
  return response;
}

describe("focused v2 fault-injection gate", () => {
  let foundationParent: string;
  let foundationRepository: string;
  let parent: string;
  let repository: string;

  beforeAll(async () => {
    foundationParent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-fault-foundation-"));
    foundationRepository = path.join(foundationParent, "repository");
    const initialized = await command(foundationParent, [
      "init",
      foundationRepository,
      "--json",
    ]);
    expect(initialized.status).toBe(0);
  });

  beforeEach(async () => {
    parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-fault-gate-"));
    repository = path.join(parent, "repository");
    await fs.cp(foundationRepository, repository, {
      recursive: true,
      errorOnExist: true,
      mode: fsConstants.COPYFILE_FICLONE,
    });
  });

  afterEach(async () => {
    await fs.chmod(path.join(repository, ".lifecycle/data"), 0o755).catch(() => {});
    await fs.rm(parent, { recursive: true, force: true });
  });

  afterAll(async () => {
    await fs.rm(foundationParent, { recursive: true, force: true });
  });

  it("recovers the same exact Assignment and rejects a mismatched package digest", async () => {
    const first = await command(repository, ["next", "--json"]);
    const second = await command(repository, ["next", "--json"]);
    expect(first.status).toBe(0);
    expect(second.status).toBe(0);
    expect(second.value.assignment).toEqual(first.value.assignment);

    const selectionPath = path.join(repository, ".lifecycle/process-selection.json");
    const selection = JSON.parse(await fs.readFile(selectionPath, "utf8"));
    selection.package.digest = `sha256:${"0".repeat(64)}`;
    await fs.writeFile(selectionPath, `${JSON.stringify(selection, null, 2)}\n`);
    const mismatched = await command(repository, ["next", "--json"]);
    expect(mismatched.status).toBe(1);
    expect(mismatched.value.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "process-package-selection-mismatch" }),
    ]));
  });

  it("derives byte-equivalent decisions from one authenticated snapshot and package", async () => {
    const selected = await selectedRepositoryPackage(repository);
    expect(selected.ok).toBe(true);
    if (!selected.ok) return;
    const phase = initialPhaseId(selected.processPackage);
    expect(phase).toEqual(expect.any(String));
    const inspection = await loadRepositoryInspection(
      repository,
      selected.processPackage,
      `${selected.summary.reference}#${selected.summary.digest}`,
    );
    expect(inspection.ok).toBe(true);
    if (!inspection.ok || !phase) return;
    const snapshot = inspection.value.lifecycleSnapshot(phase);
    const first = JSON.stringify(deriveOperatorOutcome(snapshot, selected.processPackage));
    const second = JSON.stringify(deriveOperatorOutcome(snapshot, selected.processPackage));
    expect(second).toBe(first);
  });

  it("rejects missing and undeclared resolver inputs at the package boundary", async () => {
    const loaded = await loadProcessPackage(path.join(process.cwd(), ".lifecycle/process"));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const packageValue = structuredClone(loaded.package);
    const obligation = packageValue.obligations["phase-0-foundation-review-required"]!;
    const bindings = obligation.resolve_with as JsonObject;
    bindings.inputs = { surprise: "[phase]" };
    const diagnostics = validateScenarioContracts(packageValue);
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "resolver-input-undeclared" }),
      expect.objectContaining({ code: "resolver-input-missing" }),
    ]));
  });

  it("keeps attended and dispatchable work ahead of a declared terminal", () => {
    const base: OperatorWorkFacts = {
      kind: "obligation",
      phase: "phase@1",
      instance: "work@1:subject:package@1#digest",
      definition: "work@1",
      subject: "subject",
      scenario: "perform-work@1",
      dispatchable: true,
      authorityRequirements: [],
      explanation: "Exact work remains.",
      status: "ready",
      blockedBy: [],
      blockerChains: [],
      unresolvedBindings: [],
    };
    const terminal = {
      outcome: "lifecycle-complete" as const,
      explanation: "The package condition matched.",
      evidence: {
        profile: "profile@1",
        condition: { source: "true", result: true as const, selectors: [] },
      },
    };
    const attended: OperatorWorkFacts = {
      ...base,
      authorityRequirements: [{
        policy: "attention@1",
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
      }],
    };
    expect(classifyOperatorOutcome([attended, base], terminal).kind)
      .toBe("attention-required");
    expect(classifyOperatorOutcome([base], terminal).kind).toBe("assignment");
    expect(classifyOperatorOutcome([], terminal).kind).toBe("lifecycle-complete");
  });

  it("rejects Review correction authority outside the exact Scenario allowance", async () => {
    const loaded = await loadProcessPackage(path.join(process.cwd(), ".lifecycle/process"));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const scenario = loaded.package.scenarios["review-phase-0-foundation"]!;
    const diagnostics = scenarioOutputContractDiagnostics(
      scenario,
      [{ inputs: [] }],
      [{
        name: "review_context",
        invocation: 0,
        lifecycleDatum: { type: "BSL", payload: {}, links: [], body: "" },
      }, {
        name: "review",
        invocation: 0,
        lifecycleDatum: {
          type: "REV",
          payload: {
            review_kind: "phase-0-foundation",
            correction_authority: "unbounded-operator",
          },
          links: [],
          body: "",
        },
      }],
    );
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "scenario-review-correction-authority-invalid" }),
    ]));

    const packageOwnedReview = structuredClone(scenario);
    packageOwnedReview.outputs[1].types = ["PKG"];
    packageOwnedReview.authority_evidence = { output: "review", type: "PKG" };
    const packageOwnedDiagnostics = scenarioOutputContractDiagnostics(
      packageOwnedReview,
      [{ inputs: [] }],
      [{
        name: "review_context",
        invocation: 0,
        lifecycleDatum: { type: "BSL", payload: {}, links: [], body: "" },
      }, {
        name: "review",
        invocation: 0,
        lifecycleDatum: {
          type: "PKG",
          payload: {
            review_kind: "phase-0-foundation",
            correction_authority: "unbounded-operator",
          },
          links: [],
          body: "",
        },
      }],
    );
    expect(packageOwnedDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "scenario-review-correction-authority-invalid" }),
    ]));
  });

  it("repeats schema and identity rejection without transaction or correction consumption", async () => {
    const next = (await command(repository, ["next", "--json"])).value;
    const leasePath = path.join(repository, ".lifecycle/work/active-assignment.json");
    const before = {
      data: await filesDigest(path.join(repository, ".lifecycle/data")),
      lease: await fs.readFile(leasePath, "utf8"),
      transactions: await transactionCount(repository),
    };
    const response = filledResponse(next);
    const wrongAssignment = structuredClone(response);
    wrongAssignment.assignment = "00000000-0000-4000-8000-000000000000";
    const mismatched = await command(
      repository,
      ["scenario", "submit", "-", "--json"],
      `${JSON.stringify(wrongAssignment)}\n`,
    );
    expect(mismatched.status).toBe(1);
    expect(mismatched.value.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "assignment-unavailable" }),
    ]));
    for (const [field, identity] of [
      ["stableId", "MAP-agent-authored"],
      ["revisionId", "MAP-agent-authored-r00001"],
    ]) {
      const authoredIdentity = structuredClone(response);
      authoredIdentity.proposal.outputs[0][field] = identity;
      const identityRejected = await command(
        repository,
        ["scenario", "submit", "-", "--json"],
        `${JSON.stringify(authoredIdentity)}\n`,
      );
      expect(identityRejected.status).toBe(1);
      expect(identityRejected.value).toMatchObject({
        outcome: "rejected",
        correctionConsumed: false,
        retryable: true,
      });
      expect(identityRejected.value.diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: "assignment-response-invalid",
          path: "response/proposal/outputs/0",
        }),
      ]));
      expect(await filesDigest(path.join(repository, ".lifecycle/data"))).toBe(before.data);
      expect(await fs.readFile(leasePath, "utf8")).toBe(before.lease);
      expect(await transactionCount(repository)).toBe(before.transactions);
    }

    response.proposal.outputs[1].payload = null;
    const source = `${JSON.stringify(response)}\n`;

    const first = await command(repository, ["scenario", "submit", "-", "--json"], source);
    const second = await command(repository, ["scenario", "submit", "-", "--json"], source);
    expect(first.status).toBe(1);
    expect(second.value).toEqual(first.value);
    expect(first.value).toMatchObject({
      outcome: "rejected",
      correctionConsumed: false,
      retryable: true,
    });
    expect(first.value.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "assignment-response-invalid" }),
    ]));
    expect(await filesDigest(path.join(repository, ".lifecycle/data"))).toBe(before.data);
    expect(await fs.readFile(leasePath, "utf8")).toBe(before.lease);
    expect(await transactionCount(repository)).toBe(before.transactions);
  });

  it("rejects proposal-authored authority while accepting the exact out-of-band channel", async () => {
    const next = (await command(repository, ["next", "--json"])).value;
    const response = responseFrom(next);
    response.proposal.authoritySupplies = ["stakeholder"];
    const suppliedInProse = await command(
      repository,
      ["scenario", "submit", "-", "--json"],
      `${JSON.stringify(response)}\n`,
    );
    expect(suppliedInProse.status).toBe(1);
    expect(suppliedInProse.value).toMatchObject({
      outcome: "rejected",
      correctionConsumed: false,
    });

    delete response.proposal.authoritySupplies;
    const initial = await command(
      repository,
      ["scenario", "submit", "-", "--json"],
      `${JSON.stringify(response)}\n`,
    );
    expect(initial.status, JSON.stringify(initial.value)).toBe(0);
    let attended = await command(repository, ["next", "--json"]);
    for (let index = 0; attended.value.outcome === "assignment" && index < 4; index += 1) {
      const intermediate = await command(
        repository,
        ["scenario", "submit", "-", "--json"],
        `${JSON.stringify(filledResponse(attended.value))}\n`,
      );
      expect(intermediate.status, JSON.stringify(intermediate.value)).toBe(0);
      attended = await command(repository, ["next", "--json"]);
    }
    expect(attended.value.outcome).toBe("attention-required");
    const attendedResponse = filledResponse(attended.value);
    const suppliedOutOfBand = await command(
      repository,
      ["scenario", "submit", "-", "--authority", "stakeholder", "--json"],
      `${JSON.stringify(attendedResponse)}\n`,
    );
    expect(suppliedOutOfBand.status, JSON.stringify(suppliedOutOfBand.value)).toBe(0);
    expect(suppliedOutOfBand.value).toMatchObject({
      outcome: "accepted",
      assignment: { id: attended.value.assignment.id },
    });
  });

  it("returns a stable no-replay settlement after injected publication closure ambiguity", async () => {
    const next = (await command(repository, ["next", "--json"])).value;
    const response = responseFrom(next);
    const dataRoot = path.join(repository, ".lifecycle/data");
    const before = await filesDigest(dataRoot);
    await fs.chmod(dataRoot, 0o500);
    const submitted = await command(
      repository,
      ["scenario", "submit", "-", "--json"],
      `${JSON.stringify(response)}\n`,
    );
    await fs.chmod(dataRoot, 0o755);

    expect(submitted.status).toBe(1);
    expect(submitted.value).toMatchObject({
      outcome: "settlement-required",
      assignment: { id: next.assignment.id },
      settlement: {
        assignment: next.assignment.id,
        execution: expect.any(String),
      },
      orchestration: { action: "inspect-settlement", replay: false },
    });
    expect(await filesDigest(dataRoot)).toBe(before);
    expect(await transactionCount(repository)).toBe(0);

    const replay = await command(
      repository,
      ["scenario", "submit", "-", "--json"],
      `${JSON.stringify(response)}\n`,
    );
    expect(replay.status).toBe(1);
    expect(replay.value).toMatchObject({
      outcome: "settlement-required",
      settlement: submitted.value.settlement,
      orchestration: { replay: false },
    });
    expect(await transactionCount(repository)).toBe(0);

    for (const identity of [
      submitted.value.settlement.assignment,
      submitted.value.settlement.execution,
    ]) {
      const settlement = await command(repository, [
        "scenario",
        "settlement",
        identity,
        "--json",
      ]);
      expect(settlement.status).toBe(0);
      expect(settlement.value).toMatchObject({
        outcome: "settlement-required",
        settlement: submitted.value.settlement,
        orchestration: { replay: false },
      });
    }
  });
});

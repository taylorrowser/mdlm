import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  claimNextWork,
  submitAssignmentResponse,
} from "../src/assignment.js";
import { initializeRepositoryFromProcessPackage } from "../src/repository-initialization.js";
import { currentProcessPackageIdentity } from "./helpers/current-process-package-identity.js";

const temporaryRoots: string[] = [];
const preservedRoots = new Set<string>();
const qualificationProcedureContent = [
  "Create a fresh temporary directory for the qualification run.",
  "Positive check: exercise every capability declared by the exact ENV and record the observed success.",
  "Negative control: request one capability outside the declared ENV profile and record the expected refusal.",
  "Retain the command, exit status, stdout, and stderr for both checks, then remove the temporary directory.",
].join("\n");
const qualificationExecutionProcedure = {
  content: qualificationProcedureContent,
  deadlines_ms: {
    checkout: 300_000,
    environment_check: 120_000,
    product_case: 120_000,
  },
  deadline_scope: "infrastructure-safety-only",
  timeout: {
    termination: "process-group-sigterm-then-sigkill",
    force_after_ms: 5_000,
    reaping: "all-descendants",
    capture_partial_raw_observation: true,
  },
  cleanup: "guaranteed",
  aggregation: "continue-through-all-cases",
};

async function preserveFailureEvidence(
  root: string,
  evidence: Record<string, unknown>,
): Promise<string> {
  const evidencePath = path.join(root, "installed-cutover-failure.json");
  await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  preservedRoots.add(root);
  process.stderr.write(
    `INSTALLED_CUTOVER_FAILURE path=${evidencePath}\n${JSON.stringify(evidence)}\n`,
  );
  return evidencePath;
}

async function createSuccessEvidenceTarget(
  requestedPath = process.env.MDLM_CUTOVER_SUCCESS_EVIDENCE,
): Promise<string> {
  if (requestedPath !== undefined) {
    return requestedPath;
  }
  const preservedRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "mdlm-installed-success-record-"),
  );
  temporaryRoots.push(preservedRoot);
  preservedRoots.add(preservedRoot);
  return path.join(preservedRoot, "success.json");
}

async function preserveSuccessEvidence(
  root: string,
  evidence: Record<string, unknown>,
  requestedPath?: string,
): Promise<{ evidencePath: string; durablePath: string }> {
  const durablePath = await createSuccessEvidenceTarget(requestedPath);
  const evidencePath = path.join(root, "installed-cutover-success.json");
  const bytes = `${JSON.stringify(evidence, null, 2)}\n`;
  await fs.writeFile(evidencePath, bytes);
  await fs.writeFile(durablePath, bytes);
  preservedRoots.add(root);
  process.stderr.write(`INSTALLED_CUTOVER_SUCCESS path=${durablePath}\n`);
  return { evidencePath, durablePath };
}

function errorEvidence(error: unknown): Record<string, unknown> {
  return error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : { value: String(error) };
}

async function captureJourneyFailure(
  root: string,
  state: Record<string, unknown>,
  error: unknown,
): Promise<string> {
  return preserveFailureEvidence(root, { ...state, error: errorEvidence(error) });
}

function optionalGitIdentity(repository: string): { head: string; tree: string } | null {
  const head = run("git", ["rev-parse", "HEAD"], repository);
  const tree = run("git", ["rev-parse", "HEAD^{tree}"], repository);
  return head.status === 0 && tree.status === 0
    ? { head: head.stdout.trim(), tree: tree.stdout.trim() }
    : null;
}

function run(command: string, arguments_: string[], cwd: string, input?: string) {
  return spawnSync(command, arguments_, {
    cwd,
    encoding: "utf8",
    input,
    maxBuffer: 20 * 1024 * 1024,
  });
}

function trackedRun(
  state: Record<string, unknown>,
  command: string,
  arguments_: string[],
  cwd: string,
  input?: string,
) {
  const result = run(command, arguments_, cwd, input);
  state.lastCommand = {
    command,
    arguments: arguments_,
    cwd,
    input: input ?? null,
    status: result.status,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
  };
  return result;
}

function successful(result: ReturnType<typeof run>, command: string) {
  expect(result.status, `${command}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`).toBe(0);
  return JSON.parse(result.stdout) as Record<string, any>;
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

async function fileDigest(file: string): Promise<string> {
  return createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

async function transactionCount(repository: string): Promise<number> {
  try {
    return (await fs.readdir(path.join(repository, ".lifecycle/data/.transactions"))).length;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
}

function matchingString(schema: Record<string, any>, name: string): string {
  const minimumLength = typeof schema.minLength === "number" ? schema.minLength : 0;
  if (typeof schema.pattern !== "string") {
    return `${name} value`.padEnd(minimumLength, "a");
  }
  const base = name.toLowerCase().replaceAll("_", "-").replace(/[^a-z0-9-]/g, "");
  const candidates = [base, `${base}-value`, "value", "a", "A", "1"]
    .map((candidate) => candidate.padEnd(minimumLength, "a"));
  const pattern = new RegExp(schema.pattern);
  const candidate = candidates.find((value) => pattern.test(value));
  if (candidate === undefined) {
    throw new Error(`Cannot derive a string matching schema pattern ${schema.pattern}`);
  }
  return candidate;
}

function schemaValue(schema: Record<string, any>, name: string, index = 0): unknown {
  if (Object.hasOwn(schema, "const")) return structuredClone(schema.const);
  if (Array.isArray(schema.enum)) return structuredClone(schema.enum[index] ?? schema.enum[0]);
  if (schema.type === "array") {
    const length = typeof schema.minItems === "number" ? schema.minItems : 0;
    return Array.from(
      { length },
      (_, itemIndex) => schemaValue(schema.items ?? {}, `${name}-item`, itemIndex),
    );
  }
  if (schema.type === "boolean") return true;
  if (schema.type === "integer" || schema.type === "number") return 1;
  if (schema.type === "object") return requiredPayload(schema);
  return matchingString(schema, name);
}

function requiredPayload(schema: Record<string, any>): Record<string, unknown> {
  const properties = schema.properties ?? {};
  return Object.fromEntries((schema.required ?? []).map((name: string) => [
    name,
    schemaValue(properties[name] ?? {}, name),
  ]));
}

function inputData(packet: Record<string, any>, name: string): Record<string, any>[] {
  return packet.exactInputs.flatMap((invocation: Record<string, any>) =>
    invocation.inputs
      .filter((input: Record<string, any>) => input.name === name)
      .flatMap((input: Record<string, any>) => input.values.map(
        (value: Record<string, any>) => value.data,
      ))
  );
}

function invocationInputData(
  packet: Record<string, any>,
  invocation: number,
  name: string,
): Record<string, any>[] {
  return packet.exactInputs[invocation]?.inputs
    .filter((input: Record<string, any>) => input.name === name)
    .flatMap((input: Record<string, any>) => input.values.map(
      (value: Record<string, any>) => value.data,
    )) ?? [];
}

function answeredQuestionPayload(question: Record<string, any>): Record<string, unknown> {
  const { attended_answer: _attendedAnswer, ...payload } = question.payload;
  return question.payload.kind === "preferential"
    ? {
        ...payload,
        state: "answered",
        attended_answer: "Build a CLI that counts ampersand bytes in UTF-8 input.",
      }
    : {
        ...payload,
        state: "answered",
        evidence_available: true,
    };
}

function reviewKindForScenario(scenario: string): string {
  const reviewKinds: Record<string, string> = {
    "review-phase-0-foundation": "phase-0-foundation",
    "review-phase-0-candidate": "phase-0-candidate",
    "review-phase-1-assurance": "phase-1-assurance",
  };
  const reviewKind = reviewKinds[scenario];
  if (reviewKind === undefined) {
    throw new Error(`No installed Review payload is declared for ${scenario}`);
  }
  return reviewKind;
}

function outputPayload(
  packet: Record<string, any>,
  output: Record<string, any>,
): Record<string, unknown> {
  const scenario = packet.scenario.reference.split("@")[0];
  const invocation = output.invocation ?? 0;
  const subject = invocationInputData(packet, invocation, "subject")[0]!;
  const source = inputData(packet, "source")[0]!;
  const question = inputData(packet, "question")[0]!;
  const candidate = inputData(packet, "candidate")[0]!;
  const strategy = inputData(packet, "strategy")[0]!;
  const definitions = inputData(packet, "definition_members");
  const reviews = [
    ...inputData(packet, "member_reviews"),
    ...inputData(packet, "candidate_reviews"),
  ];
  const generic = () => requiredPayload(packet.schemas[output.type].payload);
  if (scenario === "establish-initial-wayfinding-map" && output.type === "MAP") {
    return {
      title: "Sibling review wayfinding map",
      purpose: "Reach one reviewed product specification and six sibling requirements.",
      frontier: ["product-intent"],
    };
  }
  if (scenario === "establish-initial-wayfinding-map" && output.type === "QST") {
    return {
      ...generic(),
      title: output.handle === "product_intent"
        ? "Sibling review product intent"
        : "Sibling review evidence boundary",
      kind: output.handle === "product_intent" ? "preferential" : "empirical",
      question: output.handle === "product_intent"
        ? "Which exact product should the sibling requirements define?"
        : "Which repository evidence bounds that product?",
      state: "open",
      blocking_impact: "Product specification compilation waits for this answer.",
      intent_scope: "product",
    };
  }
  if (scenario === "resolve-question" && output.type === "QST") {
    return answeredQuestionPayload(question);
  }
  if (output.type === "QST") {
    return {
      ...generic(),
      title: "Resolved supporting question",
      kind: "preferential",
      question: "What evidence bounds this product?",
      state: "answered",
      blocking_impact: "No open product work remains blocked.",
      intent_scope: "product",
      attended_answer: "The exact installed journey evidence.",
    };
  }
  if (scenario === "freeze-source-boundary") {
    return {
      title: `Source boundary for ${source.revision_id}`,
      kind: "source-boundary",
      role: "source-boundary",
      scope: source.revision_id,
      group: "SAME-LINEAGE",
      definition_members: [source.revision_id],
      evidence: [],
    };
  }
  if (scenario.startsWith("review-phase-0") && output.type === "BSL") {
    return {
      title: `Review context for ${subject.revision_id}`,
      kind: "review-context",
      role: "review-context",
      scope: subject.revision_id,
      group: "DEFAULT",
      definition_members: inputData(packet, "review_context_members")
        .map((datum) => datum.revision_id),
      evidence: [],
    };
  }
  if (output.type === "REV") {
    return {
      title: `Installed review of ${subject?.revision_id ?? candidate?.revision_id}`,
      review_kind: reviewKindForScenario(scenario),
      outcome: "pass",
      reviewer: "independent-reviewer",
      summary: "The exact subject is necessary, observable, traceable, and consistent.",
      findings: [],
      rubric_ref: "policies/rubrics/bootstrap-review.md@3",
      correction_authority: "author",
    };
  }
  if (scenario === "write-verification-activity" && output.type === "VER") {
    return {
      ...generic(),
      kind: "pilot",
      claim: {
        kind: "pilot",
        scope: "verification-design",
        formal_evidence_eligible: false,
      },
    };
  }
  if (scenario === "realize-verification-environment" && output.type === "ENV") {
    return {
      title: "Installed verification environment",
      rationale: "Realize the exact declared strategy profile for qualification.",
      strategy_revision: strategy.revision_id,
      profile_id: strategy.payload.environment_profile.id,
      capabilities: structuredClone(strategy.payload.environment_profile.capabilities),
      reproducibility: {
        environment_ref: "installed-fixture-environment@1",
        configuration_digest: `sha256:${"0".repeat(64)}`,
        reconstruction: "Recreate the installed fixture environment from this exact profile.",
      },
    };
  }
  if (scenario === "realize-verification-environment" && output.type === "VER") {
    return {
      ...generic(),
      kind: "qualification",
      claim: {
        kind: "qualification",
        scope: "environment-capability",
        formal_evidence_eligible: false,
      },
    };
  }
  if (scenario === "realize-verification-environment" && output.type === "VAI") {
    return {
      title: "Installed environment qualification implementation",
      rationale: "Exercise the declared environment capabilities and a negative control.",
      kind: "qualification",
      implementation_ref: `procedure:sha256:${createHash("sha256")
        .update(qualificationProcedureContent)
        .digest("hex")}`,
      independence_mode: "environment-capability",
      authoring_input_refs: [strategy.revision_id],
      prohibited_inputs_observed: [
        "product source code",
        "product unit tests",
        "private implementation details",
        "uncontrolled implementation shortcuts",
      ],
      activity_bindings: ["positive capability check", "negative capability control"],
      target_behavior: {
        supported: ["declared environment capabilities"],
        intentionally_unsupported: ["undeclared environment capabilities"],
      },
      execution_procedure: structuredClone(qualificationExecutionProcedure),
    };
  }
  if (scenario === "resolve-question" && output.type === "DEC") {
    if (question.payload.kind === "empirical") {
      return {
        ...generic(),
        title: "Record the empirical question resolution",
        kind: "decision",
        decision: "The declared evidence answers the exact empirical question.",
        alternatives: ["Defer the question pending other evidence."],
        rationale: "The evidence provider supplied the exact bounded answer.",
        effective_scope: "$proposal.updated_question.revision_id",
      };
    }
    return {
      ...generic(),
      title: "Record installed product intent",
      kind: "scope",
      decision: "Build a CLI that counts ampersand bytes in UTF-8 input.",
      rationale: "This exact choice supplies the attended product boundary.",
      effective_scope: "$proposal.updated_question.revision_id",
    };
  }
  if (scenario === "record-gate-signoff" && output.type === "DEC") {
    return {
      ...generic(),
      title: "Approve installed Phase 0 intent",
      kind: "gate-signoff",
      decision: "Approve the exact candidate.",
      rationale: "The candidate is reviewed and bounded.",
      gate_outcome: "approve",
      effective_scope: candidate.revision_id,
    };
  }
  if (scenario === "create-phase-0-intent-candidate") {
    return {
      title: "Installed Phase 0 candidate",
      kind: "intent-level-candidate",
      role: "candidate",
      scope: "product",
      group: "DEFAULT",
      definition_members: definitions.map((datum) => datum.revision_id),
      evidence: reviews.map((datum) => datum.revision_id),
    };
  }
  if (scenario === "accept-phase-0-intent") {
    return {
      title: "Accepted installed Phase 0 intent",
      kind: "intent-approved",
      role: "accepted",
      scope: candidate.payload.scope,
      group: candidate.payload.group,
      definition_members: inputData(packet, "definition_members")
        .map((datum) => datum.revision_id),
      evidence: [
        ...inputData(packet, "candidate_reviews"),
        ...inputData(packet, "gate_signoff"),
        ...inputData(packet, "signoff_reviews"),
      ].map((datum) => datum.revision_id),
    };
  }
  return generic();
}

function omitsUnusedOptionalOutput(
  packet: Record<string, any>,
  output: Record<string, unknown>,
): boolean {
  return ["zero-or-one", "zero-or-more"].includes(packet.outputs.find(
    (declared: Record<string, unknown>) => declared.handle === output.handle,
  )?.cardinality)
    && packet.authority?.evidence?.output !== output.handle;
}

function completedResponse(packet: Record<string, any>) {
  const scaffold = packet.responseScaffold;
  return {
    ...scaffold,
    proposal: {
      ...scaffold.proposal,
      outputs: scaffold.proposal.outputs.map((output: Record<string, unknown>) => {
        return omitsUnusedOptionalOutput(packet, output)
          ? output
          : {
              ...output,
              links: packet.scenario.reference === "record-gate-signoff@3"
                && output.type === "DEC"
                && Array.isArray(output.links)
                ? output.links.filter(
                    (link) => link.type !== "blocks",
                  )
                : output.links,
              payload: outputPayload(packet, output),
              body: `# ${String(output.handle)}\n`,
            };
      }),
    },
  };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    preservedRoots.has(root)
      ? Promise.resolve()
      : fs.rm(root, { recursive: true, force: true })
  ));
});

describe("installed v2 cutover journey", () => {
  it("batches six sibling STK Reviews through one public Assignment", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-sibling-review-"));
    temporaryRoots.push(root);
    const repository = path.join(root, "repository");
    const initialized = await initializeRepositoryFromProcessPackage(
      repository,
      path.join(process.cwd(), ".lifecycle/process"),
    );
    expect(initialized.ok, initialized.ok ? "" : JSON.stringify(initialized.diagnostics))
      .toBe(true);
    if (!initialized.ok) return;

    let drafted = false;
    for (let step = 0; step < 20; step += 1) {
      const claimed = await claimNextWork(repository);
      expect(claimed.ok, claimed.ok ? "" : JSON.stringify(claimed.diagnostics)).toBe(true);
      if (!claimed.ok) return;
      if (
        claimed.value.outcome !== "assignment" &&
        claimed.value.outcome !== "attention-required"
      ) return;
      const packet = claimed.value.assignment.packet as Record<string, any>;
      const scenario = packet.scenario.reference;
      if (
        drafted && scenario === "review-phase-0-foundation@1" &&
        invocationInputData(packet, 0, "subject")[0]?.type === "STK"
      ) {
        expect(packet.exactInputs).toHaveLength(6);
        const subjects = packet.exactInputs.map(
          (_: Record<string, any>, invocation: number) =>
            invocationInputData(packet, invocation, "subject")[0]!.revision_id,
        );
        expect(subjects).toEqual([...subjects].sort());
        expect(new Set(subjects).size).toBe(6);
        expect(packet.authority.requirements).toEqual(
          subjects.map((_: string, invocation: number) => expect.objectContaining({
            invocation,
            authorityRequirement: expect.objectContaining({
              mode: "delegated",
              authority: "stakeholder",
              delegationAllowed: true,
            }),
          })),
        );

        const reviewResponse = completedResponse(packet);
        const failedReview = reviewResponse.proposal.outputs.find(
          (output: Record<string, any>) => output.invocation === 1 && output.output === "review",
        );
        failedReview.payload = {
          ...failedReview.payload,
          outcome: "fail",
          correction_authority: "author",
          findings: [{
            id: "F-001",
            target: subjects[1],
            relationship: "primary",
            severity: "blocking",
            summary: "The second requirement needs one bounded correction.",
            criterion: "Each requirement must be independently observable.",
            evidence: "Its current statement leaves the result ambiguous.",
            material_consequence: "Two implementations can disagree.",
          }],
        };
        const accepted = await submitAssignmentResponse(
          repository,
          JSON.stringify(reviewResponse),
        );
        expect(accepted.ok, accepted.ok ? "" : JSON.stringify(accepted.diagnostics)).toBe(true);
        if (!accepted.ok || accepted.value.outcome !== "accepted") return;
        expect(accepted.value.receipt.publications).toHaveLength(12);

        const execution = JSON.parse(await fs.readFile(path.join(
          repository,
          ".lifecycle/data/.transactions",
          accepted.value.settlement.execution,
          "execution.json",
        ), "utf8"));
        expect(execution.authority.requirements).toHaveLength(6);
        for (let invocation = 0; invocation < 6; invocation += 1) {
          const context = execution.outputs.find(
            (output: Record<string, any>) =>
              output.invocation === invocation && output.name === "review_context",
          ).data;
          const review = execution.outputs.find(
            (output: Record<string, any>) =>
              output.invocation === invocation && output.name === "review",
          ).data;
          expect(context.payload.scope).toBe(subjects[invocation]);
          expect(review.links).toEqual(expect.arrayContaining([
            { type: "reviews", target: subjects[invocation] },
            { type: "contextualizes", target: context.revision_id },
          ]));
        }

        const correction = await claimNextWork(repository);
        expect(correction.ok).toBe(true);
        if (!correction.ok || correction.value.outcome !== "assignment") return;
        expect(invocationInputData(
          correction.value.assignment.packet as Record<string, any>,
          0,
          "subject",
        )[0]?.revision_id).toBe(subjects[1]);
        return;
      }

      const response = completedResponse(packet);
      if (scenario === "draft-stakeholder-requirements@2") {
        const requirement = response.proposal.outputs.find(
          (output: Record<string, any>) => output.handle === "requirements",
        );
        response.proposal.outputs = response.proposal.outputs.flatMap(
          (output: Record<string, any>) => output === requirement
            ? Array.from({ length: 6 }, (_, index) => ({
                ...structuredClone(requirement),
                handle: `requirements-${index + 1}`,
                payload: {
                  ...requirement.payload,
                  title: `Sibling requirement ${index + 1}`,
                  statement: `The product shall expose sibling result ${index + 1}.`,
                },
              }))
            : [output],
        );
        drafted = true;
      }
      const authorities = claimed.value.outcome === "attention-required"
        ? [claimed.value.authorityRequirement.authority]
        : [];
      const submitted = await submitAssignmentResponse(
        repository,
        JSON.stringify(response),
        authorities,
      );
      expect(submitted.ok, submitted.ok ? "" : JSON.stringify(submitted.diagnostics)).toBe(true);
      if (
        scenario === "draft-stakeholder-requirements@2" && submitted.ok &&
        submitted.value.outcome === "accepted"
      ) {
        expect(submitted.value.receipt.publications).toHaveLength(6);
      }
    }
    throw new Error("Did not reach the sibling STK Review Assignment");
  }, 45_000);

  it("preserves exact evidence for an unexpected terminal outcome", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-installed-evidence-"));
    temporaryRoots.push(root);
    const commandState: Record<string, unknown> = {};
    trackedRun(commandState, process.execPath, ["-e", "process.stdout.write('first')"], root);
    trackedRun(
      commandState,
      process.execPath,
      ["-e", "process.stdout.write('second')"],
      root,
      "exact input",
    );
    expect(commandState.lastCommand).toMatchObject({
      command: process.execPath,
      arguments: ["-e", "process.stdout.write('second')"],
      cwd: root,
      input: "exact input",
      status: 0,
      stdout: "second",
      stderr: "",
    });
    const evidence = {
      source: { head: "source-head", tree: "source-tree" },
      package: { reference: "package@1", digest: "sha256:package" },
      artifact: { archiveSha256: "archive", executableSha256: "executable" },
      repository: { head: "repository-head", tree: "repository-tree" },
      trace: [{ scenario: "scenario@1", assignment: "assignment-1" }],
      terminal: { outcome: "process-dead-end", blockers: [] },
    };
    preservedRoots.add(root);
    const evidencePath = await captureJourneyFailure(root, evidence, new Error("submit failed"));
    expect(JSON.parse(await fs.readFile(evidencePath, "utf8"))).toMatchObject({
      ...evidence,
      error: { name: "Error", message: "submit failed" },
    });
    expect(preservedRoots.has(root)).toBe(true);
    preservedRoots.delete(root);
    expect(preservedRoots.has(root)).toBe(false);
  });

  it("preserves exact success evidence outside the disposable root", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-installed-success-root-"));
    const durableRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-installed-success-record-"));
    temporaryRoots.push(root, durableRoot);
    const durablePath = path.join(durableRoot, "success.json");
    const evidence = {
      status: "success",
      preservedRoot: root,
      source: { git: { head: "source-head", tree: "source-tree" } },
      package: { reference: "package@1", digest: "sha256:package" },
      artifact: { archiveSha256: "archive", executableSha256: "executable" },
      repository: { git: { head: "repository-head", tree: "repository-tree" }, dataDigest: "data" },
      trace: [{ scenario: "scenario@1", assignment: "assignment-1" }],
      assignment: {
        id: "assignment-run",
        packet: {
          exactInputs: [{ inputs: [{ name: "subject", values: [{ revisionId: "VER-r00001" }] }] }],
          responseScaffold: { contract: "mdlm-assignment-response@2" },
          outputs: [{ handle: "run", type: "RUN" }],
        },
      },
    };
    const paths = await preserveSuccessEvidence(root, evidence, durablePath);
    expect(paths).toEqual({
      evidencePath: path.join(root, "installed-cutover-success.json"),
      durablePath,
    });
    expect(JSON.parse(await fs.readFile(paths.evidencePath, "utf8"))).toEqual(evidence);
    expect(JSON.parse(await fs.readFile(paths.durablePath, "utf8"))).toEqual(evidence);
    expect(JSON.parse(await fs.readFile(paths.durablePath, "utf8")))
      .toHaveProperty("assignment.packet.exactInputs[0].inputs[0].values[0].revisionId", "VER-r00001");
    expect(preservedRoots.has(root)).toBe(true);
    preservedRoots.delete(root);
  });

  it("allocates an isolated default success evidence target", async () => {
    const originalTarget = process.env.MDLM_CUTOVER_SUCCESS_EVIDENCE;
    delete process.env.MDLM_CUTOVER_SUCCESS_EVIDENCE;
    try {
      const first = await createSuccessEvidenceTarget();
      const second = await createSuccessEvidenceTarget();
      expect(first).not.toBe(second);
      for (const target of [first, second]) {
        expect(path.basename(target)).toBe("success.json");
        expect(preservedRoots.has(path.dirname(target))).toBe(true);
        preservedRoots.delete(path.dirname(target));
      }
    } finally {
      if (originalTarget === undefined) {
        delete process.env.MDLM_CUTOVER_SUCCESS_EVIDENCE;
      } else {
        process.env.MDLM_CUTOVER_SUCCESS_EVIDENCE = originalTarget;
      }
    }
  });

  it("keeps unused optional gate outputs null", () => {
    const packet = {
      scenario: { reference: "record-gate-signoff@3" },
      exactInputs: [{
        inputs: [{
          name: "candidate",
          values: [{ data: { revision_id: "BSL-CANDIDATE-r00001" } }],
        }],
      }],
      outputs: [
        { handle: "decision", type: "DEC", cardinality: "one" },
        { handle: "questions", type: "QST", cardinality: "zero-or-more" },
      ],
      schemas: {
        DEC: { payload: { required: [], properties: {} } },
        QST: { payload: { required: [], properties: {} } },
      },
      responseScaffold: {
        proposal: {
          outputs: [
            { handle: "decision", type: "DEC", payload: null, body: null },
            { handle: "questions", type: "QST", payload: null, body: null },
          ],
        },
      },
    };

    expect(completedResponse(packet).proposal.outputs).toEqual([
      expect.objectContaining({
        handle: "decision",
        payload: expect.objectContaining({ gate_outcome: "approve" }),
      }),
      { handle: "questions", type: "QST", payload: null, body: null },
    ]);
  });

  it("preserves the approving gate Decision in accepted intent evidence", () => {
    const packet = {
      scenario: { reference: "accept-phase-0-intent@1" },
      exactInputs: [{
        inputs: [
          {
            name: "candidate",
            values: [{ data: {
              revision_id: "BSL-CANDIDATE-r00001",
              payload: { scope: "product", group: "DEFAULT" },
            } }],
          },
          {
            name: "definition_members",
            values: [{ data: { revision_id: "MAP-MEMBER-r00001" } }],
          },
          {
            name: "candidate_reviews",
            values: [{ data: { revision_id: "REV-CANDIDATE-r00001" } }],
          },
          {
            name: "gate_signoff",
            values: [{ data: { revision_id: "DEC-GATE-r00001" } }],
          },
          {
            name: "signoff_reviews",
            values: [{ data: { revision_id: "REV-GATE-r00001" } }],
          },
        ],
      }],
      outputs: [{ handle: "accepted_intent", type: "BSL", cardinality: "one" }],
      schemas: { BSL: { payload: { required: [], properties: {} } } },
      responseScaffold: {
        proposal: {
          outputs: [{
            handle: "accepted_intent",
            type: "BSL",
            payload: null,
            body: null,
          }],
        },
      },
    };

    expect(completedResponse(packet).proposal.outputs[0].payload.evidence).toEqual([
      "REV-CANDIDATE-r00001",
      "DEC-GATE-r00001",
      "REV-GATE-r00001",
    ]);
  });

  it("derives required payloads from recursive schema constraints", () => {
    expect(requiredPayload({
      required: ["system_context"],
      properties: {
        system_context: { type: "string", pattern: "^[a-z][a-z0-9-]{0,62}$" },
      },
    })).toEqual({ system_context: "system-context" });
    expect(requiredPayload({
      required: ["permitted_methods", "independence", "environment_profile"],
      properties: {
        permitted_methods: {
          type: "array",
          minItems: 1,
          items: { enum: ["inspection", "demonstration", "test", "analysis"] },
        },
        independence: {
          type: "object",
          required: ["prohibited_inputs"],
          properties: {
            prohibited_inputs: {
              const: ["product source code", "product unit tests"],
            },
          },
        },
        environment_profile: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", pattern: "^[a-z][a-z0-9-]*$" },
          },
        },
      },
    })).toEqual({
      permitted_methods: ["inspection"],
      independence: {
        prohibited_inputs: ["product source code", "product unit tests"],
      },
      environment_profile: { id: "id" },
    });
  });

  it("uses the explicit Review payload without eager generic synthesis", () => {
    const packet = {
      scenario: { reference: "review-phase-0-foundation@1" },
      exactInputs: [{
        inputs: [{
          name: "subject",
          values: [{ data: { revision_id: "MAP-SUBJECT-r00001" } }],
        }],
      }],
      outputs: [{ handle: "review", type: "REV", cardinality: "one" }],
      schemas: {
        REV: {
          payload: {
            type: "object",
            required: ["title", "outcome", "rubric_ref"],
            properties: {
              title: { type: "string", minLength: 1 },
              outcome: { enum: ["pass", "fail"] },
              rubric_ref: {
                type: "string",
                pattern: "^policies/rubrics/.+\\.md@[1-9][0-9]*$",
              },
            },
          },
        },
      },
      responseScaffold: {
        proposal: {
          outputs: [{ handle: "review", type: "REV", payload: null, body: null }],
        },
      },
    };

    for (const [scenario, reviewKind] of [
      ["review-phase-0-foundation@1", "phase-0-foundation"],
      ["review-phase-0-candidate@1", "phase-0-candidate"],
      ["review-phase-1-assurance@1", "phase-1-assurance"],
    ] as const) {
      const scenarioPacket = { ...packet, scenario: { reference: scenario } };
      expect(completedResponse(scenarioPacket).proposal.outputs[0].payload).toMatchObject({
        review_kind: reviewKind,
        rubric_ref: "policies/rubrics/bootstrap-review.md@3",
      });
    }
  });

  it("uses the declared pilot claim for a verification activity", () => {
    const packet = {
      scenario: { reference: "write-verification-activity@2" },
      exactInputs: [],
      outputs: [{ handle: "activity", type: "VER", cardinality: "one" }],
      schemas: {
        VER: {
          payload: {
            type: "object",
            required: ["title", "kind", "claim", "acceptance_criteria"],
            properties: {
              title: { type: "string", minLength: 1 },
              kind: { enum: ["qualification", "pilot", "formal"] },
              claim: {
                oneOf: [
                  {
                    type: "object",
                    required: ["kind", "scope", "formal_evidence_eligible"],
                    properties: {
                      kind: { const: "qualification" },
                      scope: { const: "environment-capability" },
                      formal_evidence_eligible: { const: false },
                    },
                  },
                  {
                    type: "object",
                    required: ["kind", "scope", "formal_evidence_eligible"],
                    properties: {
                      kind: { const: "pilot" },
                      scope: { const: "verification-design" },
                      formal_evidence_eligible: { const: false },
                    },
                  },
                ],
              },
              acceptance_criteria: {
                type: "array",
                minItems: 1,
                items: { type: "string", minLength: 1 },
              },
            },
          },
        },
      },
      responseScaffold: {
        proposal: {
          outputs: [{ handle: "activity", type: "VER", payload: null, body: null }],
        },
      },
    };

    expect(completedResponse(packet).proposal.outputs[0].payload).toMatchObject({
      title: expect.any(String),
      kind: "pilot",
      claim: {
        kind: "pilot",
        scope: "verification-design",
        formal_evidence_eligible: false,
      },
      acceptance_criteria: [expect.any(String)],
    });
  });

  it("builds one coherent environment qualification transaction", () => {
    const capabilities = {
      controllability: ["controlled input"],
      observability: ["captured output"],
      external_services: [],
      timing: "bounded execution",
    };
    const packet = {
      scenario: { reference: "realize-verification-environment@1" },
      exactInputs: [{
        inputs: [{
          name: "strategy",
          values: [{ data: {
            revision_id: "VSP-123456789A-r00001",
            payload: {
              environment_profile: { id: "pilot-cli", capabilities },
            },
          } }],
        }],
      }],
      outputs: [
        { handle: "environment", type: "ENV", cardinality: "one" },
        { handle: "qualification_activity", type: "VER", cardinality: "one" },
        { handle: "qualification_implementation", type: "VAI", cardinality: "one" },
      ],
      schemas: {
        ENV: {
          payload: {
            type: "object",
            required: ["reproducibility"],
            properties: {
              reproducibility: {
                type: "object",
                required: ["configuration_digest"],
                properties: {
                  configuration_digest: {
                    type: "string",
                    pattern: "^sha256:[a-f0-9]{64}$",
                  },
                },
              },
            },
          },
        },
        VER: { payload: { type: "object", required: [], properties: {} } },
        VAI: { payload: { type: "object", required: [], properties: {} } },
      },
      responseScaffold: {
        proposal: {
          outputs: [
            { handle: "environment", type: "ENV", payload: null, body: null },
            { handle: "qualification_activity", type: "VER", payload: null, body: null },
            { handle: "qualification_implementation", type: "VAI", payload: null, body: null },
          ],
        },
      },
    };

    const [environment, activity, implementation] = completedResponse(packet).proposal.outputs;
    expect(environment.payload).toMatchObject({
      strategy_revision: "VSP-123456789A-r00001",
      profile_id: "pilot-cli",
      capabilities,
      reproducibility: {
        configuration_digest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
    });
    expect(activity.payload).toMatchObject({
      kind: "qualification",
      claim: {
        kind: "qualification",
        scope: "environment-capability",
        formal_evidence_eligible: false,
      },
    });
    expect(implementation.payload).toMatchObject({
      kind: "qualification",
      implementation_ref: expect.stringMatching(/^procedure:sha256:[a-f0-9]{64}$/),
      independence_mode: "environment-capability",
      execution_procedure: qualificationExecutionProcedure,
    });
  });

  it("runs fresh Phase 0 through corrected Review into the first Phase 1 run loop", async () => {
    expect(answeredQuestionPayload({ payload: { kind: "preferential", state: "open" } }))
      .toMatchObject({ kind: "preferential", state: "answered", attended_answer: expect.any(String) });
    expect(answeredQuestionPayload({
      payload: { kind: "empirical", state: "open", attended_answer: "invalid carryover" },
    })).toEqual({ kind: "empirical", state: "answered", evidence_available: true });
    const optionalDecision = { handle: "decision", type: "DEC" };
    const resolverPacket: Record<string, any> = {
      scenario: { reference: "resolve-question@2" },
      outputs: [{ handle: "decision", cardinality: "zero-or-one" }],
      authority: { evidence: null },
    };
    expect(omitsUnusedOptionalOutput(
      resolverPacket,
      optionalDecision,
    )).toBe(true);
    resolverPacket.authority.evidence = { output: "decision", type: "DEC" };
    expect(omitsUnusedOptionalOutput(
      resolverPacket,
      optionalDecision,
    )).toBe(false);
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-installed-cutover-"));
    temporaryRoots.push(root);
    preservedRoots.add(root);
    const expectedPackage = await currentProcessPackageIdentity(
      path.join(process.cwd(), ".lifecycle/process"),
    );
    const packageRoot = path.join(root, "package");
    const installRoot = path.join(root, "install");
    const repository = path.join(root, "product");
    const trace: Record<string, unknown>[] = [];
    const failureState: Record<string, unknown> = {
      preservedRoot: root,
      source: { git: optionalGitIdentity(process.cwd()), worktree: process.cwd() },
      trace,
    };
    try {
    await fs.mkdir(packageRoot, { recursive: true });

    const packed = trackedRun(
      failureState,
      "npm",
      ["pack", "--pack-destination", packageRoot, "--silent"],
      process.cwd(),
    );
    expect(packed.status, packed.stderr).toBe(0);
    const archive = path.join(packageRoot, packed.stdout.trim().split("\n").at(-1)!);
    const installed = trackedRun(
      failureState,
      "npm",
      ["install", "--prefix", installRoot, "--ignore-scripts", "--offline", archive],
      process.cwd(),
    );
    expect(installed.status, installed.stderr).toBe(0);
    const executable = path.join(installRoot, "node_modules/mdlm/dist/mdlm.js");
    const archiveDigest = await fileDigest(archive);
    const executableDigest = await fileDigest(executable);
    failureState.artifact = {
      archive: path.basename(archive),
      archiveSha256: archiveDigest,
      executable: "node_modules/mdlm/dist/mdlm.js",
      executableSha256: executableDigest,
    };

    const initialized = successful(
      trackedRun(
        failureState,
        process.execPath,
        [executable, "init", repository, "--json"],
        root,
      ),
      "installed mdlm init",
    );
    expect(initialized.package).toMatchObject({
      reference: expectedPackage.reference,
      digest: expectedPackage.digest,
    });
    failureState.package = initialized.package;

    const next = successful(
      trackedRun(
        failureState,
        process.execPath,
        [executable, "next", "--json"],
        repository,
      ),
      "installed mdlm next",
    );
    expect(next).toMatchObject({
      contract: "mdlm-next@2",
      outcome: "assignment",
      assignment: { packet: { contract: "mdlm-assignment-packet@3" } },
    });
    failureState.lastNext = next;
    const scaffold = next.assignment.packet.responseScaffold;
    const payloads: Record<string, Record<string, unknown>> = {
      map: {
        title: "Initial product wayfinding map",
        purpose: "Index the exact questions that bound the initial product intent.",
        frontier: ["product-intent"],
      },
      product_intent: {
        title: "Intended product",
        kind: "preferential",
        intent_scope: "product",
        question: "What product do you currently intend to build?",
        state: "open",
        blocking_impact: "PSP compilation waits for the stakeholder answer.",
      },
      questions: {
        title: "Initial empirical boundary",
        kind: "empirical",
        question: "Which repository evidence is relevant to the intended product?",
        state: "open",
        blocking_impact: "No product claim is inferred from repository evidence.",
      },
    };
    const response = {
      ...scaffold,
      proposal: {
        ...scaffold.proposal,
        outputs: scaffold.proposal.outputs.map((output: Record<string, unknown>) => ({
          ...output,
          payload: payloads[String(output.handle)],
          body: `# ${String(output.handle)}\n`,
        })),
      },
    };
    const submittedResult = trackedRun(
      failureState,
      process.execPath,
      [executable, "scenario", "submit", "-", "--json"],
      repository,
      `${JSON.stringify(response)}\n`,
    );
    const submitted = successful(
      submittedResult,
      "installed mdlm scenario submit",
    );
    expect(submitted).toMatchObject({
      contract: "mdlm-submission-outcome@1",
      outcome: "accepted",
      assignment: { id: next.assignment.id },
    });
    expect(submitted).not.toHaveProperty("orchestration");
    expect(submitted.receipt.publications).toHaveLength(3);
    expect(submitted.settlement.execution).toEqual(expect.any(String));
    trace.push({
      phase: next.phase,
      scenario: next.assignment.packet.scenario.reference,
      assignment: next.assignment.id,
      execution: submitted.settlement.execution,
      responseDigest: submitted.responseDigest,
      settlement: submitted.settlement,
      publications: submitted.receipt.publications,
    });
    let rejectedReview = false;
    let correctedReview = false;
    let rejectedQualificationWithoutProcedure = false;
    let qualificationProcedureProjected = false;
    let phase1RunOrResult = false;
    let phase1Boundary: Record<string, any> | undefined;
    const scenarios: string[] = [];
    for (let step = 0; step < 60 && !phase1RunOrResult; step += 1) {
      const nextResult = trackedRun(
        failureState,
        process.execPath,
        [executable, "next", "--json"],
        repository,
      );
      const outcome = successful(
        nextResult,
        `installed mdlm next step ${step}`,
      );
      failureState.lastNext = outcome;
      if (!["assignment", "attention-required"].includes(outcome.outcome)) {
        failureState.terminal = outcome;
        throw new Error(`Unexpected installed outcome '${String(outcome.outcome)}'`);
      }
      const packet = outcome.assignment.packet;
      scenarios.push(packet.scenario.reference);
      const outputTypes = packet.outputs.map((output: Record<string, unknown>) => output.type);
      if (
        correctedReview
        && outcome.phase.startsWith("phase-1-product-assurance@")
        && outputTypes.some((type: string) => type === "RUN" || type === "RES")
      ) {
        const implementation = inputData(packet, "implementation")[0]!;
        expect(implementation.payload).toMatchObject({
          kind: "qualification",
          execution_procedure: qualificationExecutionProcedure,
        });
        expect(implementation.payload.execution_procedure.content)
          .toBe(qualificationProcedureContent);
        qualificationProcedureProjected = true;
        phase1RunOrResult = true;
        phase1Boundary = outcome;
        break;
      }
      const response = completedResponse(packet);
      expect(response.proposal.outputs.map(
        (output: Record<string, unknown>) => output.handle,
      )).toEqual(packet.responseScaffold.proposal.outputs.map(
        (output: Record<string, unknown>) => output.handle,
      ));
      if (!rejectedReview && packet.scenario.reference.startsWith("review-phase-0-")) {
        const leasePath = path.join(repository, ".lifecycle/work/active-assignment.json");
        const before = {
          data: await filesDigest(path.join(repository, ".lifecycle/data")),
          lease: await fs.readFile(leasePath, "utf8"),
          transactions: await transactionCount(repository),
        };
        const reviewOutput = response.proposal.outputs.find(
          (output: Record<string, unknown>) => output.type === "REV",
        );
        for (const linkType of ["reviews", "contextualizes"]) {
          const mismatched = structuredClone(response);
          const wrongTarget = linkType === "reviews"
            ? inputData(packet, "review_context_members").find(
              (datum) => datum.revision_id !== inputData(packet, "subject")[0]!.revision_id,
            )!.revision_id
            : inputData(packet, "subject")[0]!.revision_id;
          mismatched.proposal.outputs.find(
            (output: Record<string, unknown>) => output.type === "REV",
          ).links.find(
            (link: Record<string, unknown>) => link.type === linkType,
          ).target = { datum: wrongTarget };
          const rejectedLink = trackedRun(
            failureState,
            process.execPath,
            [executable, "scenario", "submit", "-", "--json"],
            repository,
            `${JSON.stringify(mismatched)}\n`,
          );
          expect(rejectedLink.status).toBe(1);
          expect(JSON.parse(rejectedLink.stdout)).toMatchObject({
            outcome: "rejected",
            assignment: { id: outcome.assignment.id },
            retryable: true,
            correctionConsumed: false,
            diagnostics: expect.arrayContaining([expect.objectContaining({
              code: "assignment-response-links-invalid",
              path: "proposal.outputs.review.links",
            })]),
          });
          expect(await filesDigest(path.join(repository, ".lifecycle/data"))).toBe(before.data);
          expect(await fs.readFile(leasePath, "utf8")).toBe(before.lease);
          expect(await transactionCount(repository)).toBe(before.transactions);
        }
        expect(reviewOutput).toBeDefined();
        const invalid = structuredClone(response);
        invalid.proposal.outputs.find(
          (output: Record<string, unknown>) => output.type === "REV",
        ).payload = {};
        const firstRejection = trackedRun(
          failureState,
          process.execPath,
          [executable, "scenario", "submit", "-", "--json"],
          repository,
          `${JSON.stringify(invalid)}\n`,
        );
        expect(firstRejection.status).toBe(1);
        expect(JSON.parse(firstRejection.stdout)).toMatchObject({
          contract: "mdlm-submission-outcome@1",
          outcome: "rejected",
          assignment: { id: outcome.assignment.id },
          retryable: true,
          correctionConsumed: false,
        });
        const recovered = successful(
          trackedRun(
            failureState,
            process.execPath,
            [executable, "next", "--json"],
            repository,
          ),
          "installed mdlm next after rejected Review",
        );
        expect(recovered.assignment).toEqual(outcome.assignment);
        rejectedReview = true;
      }
      if (packet.scenario.reference === "realize-verification-environment@1") {
        const missingProcedure = structuredClone(response);
        const implementation = missingProcedure.proposal.outputs.find(
          (output: Record<string, unknown>) => output.type === "VAI",
        );
        implementation.payload.implementation_ref = `procedure:sha256:${"0".repeat(64)}`;
        delete implementation.payload.execution_procedure;
        const rejected = trackedRun(
          failureState,
          process.execPath,
          [executable, "scenario", "submit", "-", "--json"],
          repository,
          `${JSON.stringify(missingProcedure)}\n`,
        );
        expect(rejected.status).toBe(1);
        expect(JSON.parse(rejected.stdout)).toMatchObject({
          contract: "mdlm-submission-outcome@1",
          outcome: "rejected",
          assignment: { id: outcome.assignment.id },
          retryable: true,
          correctionConsumed: false,
        });
        const recovered = successful(
          trackedRun(
            failureState,
            process.execPath,
            [executable, "next", "--json"],
            repository,
          ),
          "installed mdlm next after missing qualification procedure",
        );
        expect(recovered.assignment).toEqual(outcome.assignment);
        rejectedQualificationWithoutProcedure = true;
      }
      const arguments_ = [executable, "scenario", "submit", "-", "--json"];
      if (outcome.outcome === "attention-required") {
        expect(packet.authority.requirements.map(
          (requirement: Record<string, any>) =>
            requirement.authorityRequirement.authority,
        )).toContain(outcome.authorityRequirement.authority);
        expect(response).not.toHaveProperty("authority");
        arguments_.splice(
          -1,
          0,
          "--authority",
          outcome.authorityRequirement.authority,
        );
      }
      const acceptedResult = trackedRun(
        failureState,
        process.execPath,
        arguments_,
        repository,
        `${JSON.stringify(response)}\n`,
      );
      const accepted = successful(
        acceptedResult,
        `installed submit ${packet.scenario.reference}`,
      );
      expect(accepted.outcome).toBe("accepted");
      trace.push({
        phase: outcome.phase,
        scenario: packet.scenario.reference,
        assignment: outcome.assignment.id,
        execution: accepted.settlement.execution,
        responseDigest: accepted.responseDigest,
        settlement: accepted.settlement,
        publications: accepted.receipt.publications,
      });
      if (rejectedReview && packet.scenario.reference.startsWith("review-phase-0-")) {
        expect(accepted.receipt.publications.map(
          (publication: Record<string, unknown>) => publication.handle,
        )).toEqual(["context", "review"]);
        const execution = JSON.parse(await fs.readFile(path.join(
          repository,
          ".lifecycle/data/.transactions",
          accepted.settlement.execution,
          "execution.json",
        ), "utf8")) as Record<string, any>;
        expect(execution.outputs.map(
          (output: Record<string, any>) => output.data.type,
        )).toEqual(["BSL", "REV"]);
        const context = execution.outputs.find(
          (output: Record<string, any>) => output.handle === "context",
        );
        const review = execution.outputs.find(
          (output: Record<string, any>) => output.handle === "review",
        );
        expect(review.data.links).toEqual(expect.arrayContaining([
          { type: "reviews", target: inputData(packet, "subject")[0]!.revision_id },
          { type: "contextualizes", target: context.data.revision_id },
        ]));
        correctedReview = true;
      }
    }
    expect(rejectedReview).toBe(true);
    expect(correctedReview, scenarios.join(" -> ")).toBe(true);
    expect(rejectedQualificationWithoutProcedure, scenarios.join(" -> ")).toBe(true);
    expect(qualificationProcedureProjected, scenarios.join(" -> ")).toBe(true);
    expect(phase1RunOrResult, scenarios.join(" -> ")).toBe(true);
    const successEvidence = {
      status: "success",
      preservedRoot: root,
      source: failureState.source,
      artifact: failureState.artifact,
      package: initialized.package,
      repository: {
        path: repository,
        git: optionalGitIdentity(repository),
        dataDigest: await filesDigest(path.join(repository, ".lifecycle/data")),
        authenticated: phase1Boundary?.repository,
      },
      trace,
      phase: phase1Boundary?.phase,
      assignment: phase1Boundary?.assignment,
      scenarios,
    };
    const successPaths = await preserveSuccessEvidence(root, successEvidence);
    if (process.env.MDLM_CUTOVER_SUCCESS_EVIDENCE !== undefined) {
      expect(successPaths.durablePath).toBe(process.env.MDLM_CUTOVER_SUCCESS_EVIDENCE);
    } else {
      expect(path.basename(successPaths.durablePath)).toBe("success.json");
      expect(path.basename(path.dirname(successPaths.durablePath)))
        .toMatch(/^mdlm-installed-success-record-/);
    }
    } catch (error) {
      failureState.repository = {
        path: repository,
        git: optionalGitIdentity(repository),
        dataDigest: await filesDigest(path.join(repository, ".lifecycle/data")),
        authenticated: (failureState.lastNext as Record<string, unknown> | undefined)
          ?.repository,
      };
      const evidencePath = await captureJourneyFailure(root, failureState, error);
      throw new Error(
        `Installed cutover journey failed; evidence=${evidencePath}`,
        { cause: error },
      );
    }
  }, 600_000);
});

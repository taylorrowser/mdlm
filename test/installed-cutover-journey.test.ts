import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporaryRoots: string[] = [];
const preservedRoots = new Set<string>();

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

function requiredPayload(schema: Record<string, any>): Record<string, unknown> {
  const properties = schema.properties ?? {};
  return Object.fromEntries((schema.required ?? []).map((name: string) => {
    const property = properties[name] ?? {};
    if (Array.isArray(property.enum)) return [name, property.enum[0]];
    if (property.type === "array") return [name, property.minItems ? ["evidence"] : []];
    if (property.type === "boolean") return [name, true];
    if (property.type === "integer" || property.type === "number") return [name, 1];
    if (property.type === "object") return [name, requiredPayload(property)];
    if (property.pattern === "^[a-z][a-z0-9-]{0,62}$") {
      return [name, name.toLowerCase().replaceAll("_", "-")];
    }
    return [name, `${name} value`];
  }));
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

function outputPayload(
  packet: Record<string, any>,
  output: Record<string, any>,
): Record<string, unknown> {
  const scenario = packet.scenario.reference.split("@")[0];
  const subject = inputData(packet, "subject")[0]!;
  const source = inputData(packet, "source")[0]!;
  const question = inputData(packet, "question")[0]!;
  const candidate = inputData(packet, "candidate")[0]!;
  const definitions = inputData(packet, "definition_members");
  const reviews = [
    ...inputData(packet, "member_reviews"),
    ...inputData(packet, "candidate_reviews"),
  ];
  const generic = requiredPayload(packet.schemas[output.type].payload);
  if (scenario === "resolve-question" && output.type === "QST") {
    return answeredQuestionPayload(question);
  }
  if (output.type === "QST") {
    return {
      ...generic,
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
      ...generic,
      title: `Installed review of ${subject?.revision_id ?? candidate?.revision_id}`,
      review_kind: scenario === "review-phase-0-candidate"
        ? "phase-0-candidate"
        : "phase-0-foundation",
      outcome: "pass",
      reviewer: "independent-reviewer",
      summary: "The exact subject is necessary, observable, traceable, and consistent.",
      findings: [],
      rubric_ref: "policies/rubrics/bootstrap-review.md@3",
      correction_authority: "author",
    };
  }
  if (scenario === "resolve-question" && output.type === "DEC") {
    if (question.payload.kind === "empirical") {
      return {
        ...generic,
        title: "Record the empirical question resolution",
        kind: "decision",
        decision: "The declared evidence answers the exact empirical question.",
        alternatives: ["Defer the question pending other evidence."],
        rationale: "The evidence provider supplied the exact bounded answer.",
        effective_scope: "$proposal.updated_question.revision_id",
      };
    }
    return {
      ...generic,
      title: "Record installed product intent",
      kind: "scope",
      decision: "Build a CLI that counts ampersand bytes in UTF-8 input.",
      rationale: "This exact choice supplies the attended product boundary.",
      effective_scope: "$proposal.updated_question.revision_id",
    };
  }
  if (scenario === "record-gate-signoff" && output.type === "DEC") {
    return {
      ...generic,
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
        ...inputData(packet, "signoff_reviews"),
      ].map((datum) => datum.revision_id),
    };
  }
  return generic;
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
    expect(requiredPayload({
      required: ["system_context"],
      properties: {
        system_context: { type: "string", pattern: "^[a-z][a-z0-9-]{0,62}$" },
      },
    })).toEqual({ system_context: "system-context" });
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-installed-cutover-"));
    temporaryRoots.push(root);
    preservedRoots.add(root);
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
    expect(initialized.package.reference).toBe("mdlm-bootstrap@0.81.0");
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
    expect(phase1RunOrResult, scenarios.join(" -> ")).toBe(true);
    console.log(JSON.stringify({
      archive: { name: path.basename(archive), sha256: archiveDigest },
      executable: { relativePath: "node_modules/mdlm/dist/mdlm.js", sha256: executableDigest },
      package: initialized.package,
      repository: phase1Boundary?.repository,
      phase: phase1Boundary?.phase,
      assignment: {
        id: phase1Boundary?.assignment.id,
        scenario: phase1Boundary?.assignment.packet.scenario.reference,
        outputs: phase1Boundary?.assignment.packet.outputs.map(
          (output: Record<string, unknown>) => ({ handle: output.handle, type: output.type }),
        ),
      },
      scenarios,
    }));
    preservedRoots.delete(root);
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

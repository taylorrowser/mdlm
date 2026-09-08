import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  PROCESS_REPOSITORY_HOOK_TIMEOUT_MS,
  PROCESS_REPOSITORY_TEST_TIMEOUT_MS,
} from "../scripts/root-test-observation-policy.mjs";
import { parse, stringify } from "yaml";
import {
  operatorTerminalOutcomeProjection,
  operatorWorkProjection,
  type OperatorStatus,
} from "../src/assignment.js";
import {
  evaluateLifecycle,
  type LifecycleEvaluation,
  type ProcessPackage,
} from "../src/index.js";
import {
  executeCommandApplication,
  renderOperatorStatus,
} from "../src/command-application.js";
import { processPackageDigest } from "../src/process-package-digest.js";
import { selectedImplementationProfile } from "../src/implementation-profile.js";
import {
  activeLifecycleEvaluation,
  initialPhaseId,
} from "../src/lifecycle-inspection.js";
import { loadRepositoryInspection } from "../src/repository-inspection.js";
import { dryRunResolverScenario } from "../src/scenario-dry-run.js";
import {
  submitPreparedResolverScenario,
  type ScenarioExecution,
  type ScenarioProposal,
} from "../src/scenario-execution.js";
import { selectedRepositoryPackage } from "../src/selected-package.js";
import { canonicalProcessPackage } from "./helpers/canonical-process-package-fixture.js";
import {
  mdlm,
  mdlmWithInputAndEnvironment,
  selectProcessPackageFixture,
} from "./helpers/mdlm.js";
import { operatorTerminalProcessPackageFixture } from "./helpers/terminal-process-package-fixture.js";
import {
  terminalProcessPackage,
  terminalProcessRepository,
} from "./helpers/terminal-process-package.js";

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

async function applicationMdlm(repository: string, ...arguments_: string[]) {
  const execution = await executeCommandApplication(arguments_, repository);
  return { status: execution.exitCode, stdout: execution.output, stderr: "" };
}

async function recordInstalledPackageChange(
  repository: string,
  packageRoot: string,
): Promise<void> {
  const digest = await processPackageDigest(packageRoot);
  for (const relativePath of [
    ".lifecycle/process-selection.json",
    ".lifecycle/repository.json",
  ]) {
    const contractPath = path.join(repository, relativePath);
    const contract = JSON.parse(await fs.readFile(contractPath, "utf8"));
    contract.package.digest = digest;
    await fs.writeFile(contractPath, `${JSON.stringify(contract, null, 2)}\n`);
  }
}

async function publishPreparedScenario(
  repository: string,
  scenarioReference: string,
  proposal: ScenarioProposal,
): Promise<ScenarioExecution> {
  const selected = await selectedRepositoryPackage(repository);
  if (!selected.ok) throw new Error(JSON.stringify(selected.diagnostics));
  const firstPhase = initialPhaseId(selected.processPackage);
  if (!firstPhase) throw new Error("Expected an initial Phase");
  const inspection = await loadRepositoryInspection(
    repository,
    selected.processPackage,
    `${selected.summary.reference}#${selected.summary.digest}`,
  );
  if (!inspection.ok) throw new Error(JSON.stringify(inspection.diagnostics));
  const snapshot = deepFreeze(inspection.value.lifecycleSnapshot(firstPhase));
  const evaluation = deepFreeze(evaluateLifecycle(selected.processPackage, snapshot));
  const work = operatorWorkProjection(evaluation, snapshot.records).find(
    (item) => item.kind === "obligation" && item.scenario === scenarioReference,
  );
  if (!work) throw new Error(`Missing dispatchable work for '${scenarioReference}'`);
  const prepared = await dryRunResolverScenario(
    selected.processPackage,
    snapshot,
    scenarioReference,
    work.instance,
    [],
    evaluation,
  );
  if (!prepared.ok) throw new Error(JSON.stringify(prepared.diagnostics));
  const scenario = selected.processPackage.scenarios[scenarioReference.split("@")[0]!];
  if (!scenario) throw new Error(`Missing Scenario '${scenarioReference}'`);
  const transaction = inspection.value.beginTransaction();
  const assignment = randomUUID();
  const responseDigest = `sha256:${createHash("sha256")
    .update(JSON.stringify({ assignment, proposal }))
    .digest("hex")}`;
  const submitted = await submitPreparedResolverScenario(
    repository,
    selected.processPackage,
    {
      reference: selected.summary.reference,
      digest: selected.summary.digest,
      language: selected.summary.language,
    },
    {
      scenarioReference,
      obligationInstance: work.instance,
      proposal,
      assignment,
      responseDigest,
      suppliedAuthorities: [],
      suppliedDelegations: [],
      loadedSkillRefs: prepared.value.prompt.skills.map((skill) => skill.reference),
    },
    {
      dryRun: prepared.value,
      evaluation,
      scenario,
      snapshot,
      finalizeExactBaseline: (_root, _package, _processRef, proposedDatum) =>
        transaction.finalizeExactBaseline(proposedDatum),
      publishMutation: (
        _root,
        _package,
        expectedData,
        data,
        executionId,
        executionRecord,
        kernelFinalizedOutputs,
      ) =>
        transaction.publishScenarioMutation(
          expectedData,
          data,
          executionId,
          executionRecord,
          kernelFinalizedOutputs,
        ),
    },
  );
  if (!submitted.ok) throw new Error(JSON.stringify(submitted.diagnostics));
  return submitted.value;
}

describe("public mdlm outcome and status seam", () => {
  let foundationParent: string;
  let repositoryFoundation: string;
  let bootstrapPackageFoundation: ProcessPackage;
  let terminalPackageFoundation: ProcessPackage;
  let operatorStatusFoundation: OperatorStatus;
  let parent: string;
  let repository: string;

  beforeAll(async () => {
    foundationParent = await fs.mkdtemp(
      path.join(os.tmpdir(), "mdlm-operator-outcome-foundation-"),
    );
    repositoryFoundation = path.join(foundationParent, "repository");
    const initialized = await applicationMdlm(
      foundationParent,
      "init",
      repositoryFoundation,
      "--json",
    );
    if (initialized.status !== 0) {
      throw new Error(`${initialized.stderr}${initialized.stdout}`);
    }
    const status = await applicationMdlm(
      repositoryFoundation,
      "status",
      "--json",
    );
    if (status.status !== 0) throw new Error(`${status.stderr}${status.stdout}`);
    operatorStatusFoundation = deepFreeze(
      JSON.parse(status.stdout) as OperatorStatus,
    );

    bootstrapPackageFoundation = await canonicalProcessPackage();
    terminalPackageFoundation = await operatorTerminalProcessPackageFixture();
  }, PROCESS_REPOSITORY_HOOK_TIMEOUT_MS);

  afterAll(async () => {
    await fs.rm(foundationParent, { recursive: true, force: true });
  });

  beforeEach(async () => {
    parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-operator-outcome-"));
    repository = path.join(parent, "repository");
  });

  afterEach(async () => {
    await fs.rm(parent, { recursive: true, force: true });
  });

  async function initializeRepository(): Promise<void> {
    await fs.cp(repositoryFoundation, repository, {
      recursive: true,
      force: false,
      errorOnExist: true,
      mode: fsConstants.COPYFILE_FICLONE,
    });
  }

  function initializedPackageRoot(): string {
    return path.join(
      repository,
      ".lifecycle/packages",
      operatorStatusFoundation.package.reference,
    );
  }

  function terminalEvaluation(
    outcome: "profile-boundary" | "lifecycle-complete" | "ambiguous",
  ): LifecycleEvaluation {
    const processPackage = structuredClone(terminalPackageFoundation);
    const profile = processPackage.profiles.terminal!;
    const terminalOutcomes = profile.terminal_outcomes as Record<string, unknown>;
    if (outcome === "profile-boundary") delete terminalOutcomes.lifecycle_complete;
    if (outcome === "lifecycle-complete") {
      terminalOutcomes.lifecycle_complete = {
        ...structuredClone(
          terminalOutcomes.profile_boundary as Record<string, unknown>,
        ),
        explanation: "Every lifecycle objective selected by this package is complete.",
      };
      delete terminalOutcomes.profile_boundary;
    }
    return deepFreeze(activeLifecycleEvaluation(processPackage, {
      processRef: "terminal-fixture@1.0.0#sha256:test",
      phaseId: "phase-0-terminal",
      records: [],
      dependencyComparisons: [],
    }));
  }

  function classifyTerminalEvaluation(evaluation: LifecycleEvaluation) {
    return classifyOperatorOutcome(
      operatorWorkProjection(evaluation),
      evaluation.terminalOutcome,
      evaluation.phase?.attentionCheckpoints
        .filter((checkpoint) => checkpoint.active)
        .map((checkpoint) => checkpoint.id) ?? [],
    );
  }

  it("includes a directory-discovered Review rubric in the public next packet", async () => {
    const processRoot = await terminalProcessPackage(parent);

    const manifestPath = path.join(processRoot, "manifest.yaml");
    const manifest = parse(await fs.readFile(manifestPath, "utf8"));
    delete manifest.catalog;
    delete manifest.assets;
    await fs.writeFile(manifestPath, stringify(manifest));

    const policyPath = path.join(processRoot, "policies/no-waiver.yaml");
    const policy = parse(await fs.readFile(policyPath, "utf8"));
    policy.result_schema.required = ["rubric_ref"];
    policy.result_schema.properties.rubric_ref = { type: "string" };
    policy.default.rubric_ref = "policies/rubrics/fixture-review.md@1";
    await fs.writeFile(policyPath, stringify(policy));

    const scenarioPath = path.join(
      processRoot,
      "scenarios/record-terminal-item.yaml",
    );
    const scenario = parse(await fs.readFile(scenarioPath, "utf8"));
    scenario.review_policy_arguments = { instance: '"terminal-check"' };
    await fs.writeFile(scenarioPath, stringify(scenario));

    const obligationPath = path.join(
      processRoot,
      "obligations/terminal-check.yaml",
    );
    const obligation = parse(await fs.readFile(obligationPath, "utf8"));
    obligation.satisfied_when = "false";
    await fs.writeFile(obligationPath, stringify(obligation));

    const phasePath = path.join(processRoot, "phases/phase-0-terminal.yaml");
    const phase = parse(await fs.readFile(phasePath, "utf8"));
    delete phase.scenarios;
    delete phase.obligations;
    phase.routing = {
      eligible_when: "dispatchable",
      status_order: ["ready", "awaiting-review", "failed", "stale", "blocked"],
      tie_breakers: ["subject", "obligation"],
    };
    await fs.writeFile(phasePath, stringify(phase));

    const rubricPath = path.join(
      processRoot,
      "policies/rubrics/fixture-review.md",
    );
    await fs.mkdir(path.dirname(rubricPath), { recursive: true });
    await fs.writeFile(
      rubricPath,
      "---\nid: fixture-review\nversion: 1\n---\n\n# Fixture Review rubric\n",
    );

    await fs.mkdir(repository);
    await selectProcessPackageFixture(repository, processRoot);

    const result = mdlm(repository, "next", "--json");
    expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
    const outcome = JSON.parse(result.stdout);
    expect(outcome.outcome).toBe("assignment");
    expect(outcome.assignment.packet).not.toHaveProperty("assets");
    expect(outcome.assignment.packet.policies).toContainEqual(
      expect.objectContaining({
        role: "review",
        evaluations: [expect.objectContaining({
          result: expect.objectContaining({
            rubric_ref: "policies/rubrics/fixture-review.md@1",
          }),
          assets: [expect.objectContaining({
            reference: "policies/rubrics/fixture-review.md@1",
            path: "policies/rubrics/fixture-review.md",
            digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
            content: expect.stringContaining("# Fixture Review rubric"),
          })],
        })],
      }),
    );
  });

  it("reports status without allocating an Assignment", async () => {
    await initializeRepository();
    const statusProjection = operatorStatusFoundation;
    expect(statusProjection).toEqual(
      expect.objectContaining({
        ok: true,
        command: "status",
        contract: "mdlm-status@1",
        integrity: { status: "valid", diagnostics: [] },
        activePhase: expect.objectContaining({
        purpose: expect.any(String),
      }),
        omittedCoverage: expect.objectContaining({
        profile: expect.any(Array),
        phase: expect.any(Array),
      }),
        recentTransaction: { available: false },
        unresolvedWork: expect.objectContaining({ total: expect.any(Number) }),
        currentOutcome: expect.objectContaining({
        outcome: "assignment",
        assignment: { allocation: "not-allocated" },
      }),
        drillDownCommands: expect.arrayContaining([
        "mdlm next",
        "mdlm loose-ends --json",
      ]),
        diagnostics: [],
      }),
    );
    const readable = renderOperatorStatus(statusProjection);
    expect(readable).toContain("Current Operator Outcome: assignment");
    await expect(fs.stat(path.join(
      repository,
      ".lifecycle/work/active-assignment.json",
    ))).rejects.toMatchObject({ code: "ENOENT" });

  });

  it("resolves the package-declared default from multiple valid profiles", () => {
    const processPackage = structuredClone(bootstrapPackageFoundation);
    const currentVersion = processPackage.profiles.bootstrap!.version;
    const alternateReference = `alternate@${currentVersion}`;
    processPackage.profiles.alternate = {
      ...structuredClone(processPackage.profiles.bootstrap!),
      id: "alternate",
    };
    processPackage.manifest.profiles = {
      default: alternateReference,
      available: [
        `profiles/bootstrap.yaml@${currentVersion}`,
        `profiles/alternate.yaml@${currentVersion}`,
      ],
    };

    expect(selectedImplementationProfile(processPackage)).toEqual({
      reference: alternateReference,
      definition: expect.objectContaining({ id: "alternate", version: currentVersion }),
    });
  });

  it("submits package-declared progression in a noninitial Phase from one inspection", async () => {
    await initializeRepository();
    const packageRoot = initializedPackageRoot();
    await fs.writeFile(
      path.join(packageRoot, "phases/phase-0-wayfinding.yaml"),
      `kind: phase-definition
id: phase-0-wayfinding
version: 2
order: 0
name: Progression-only profile
purpose: Reach a noninitial Phase before package-declared progression work.
coverage: bootstrap-subset
omitted_capabilities: [all other lifecycle work]
entry: 'true'
scenarios: [establish-initial-wayfinding-map@2, record-consequential-decision@1]
obligations: [initial-wayfinding-map-required@2]
outputs: [MAP, QST, DEC]
progression:
  next_phase: phase-1-product-assurance
  readiness: 'exists("current-wayfinding-maps@1", {})'
  authorization:
    condition: 'exists("current-wayfinding-maps@1", {})'
    policy_ref: phase-progression-participation@1
    arguments: {phase: 'phase'}
    scenario: record-consequential-decision@1
    subjects: 'select("current-wayfinding-maps@1", {})'
    evidence_selector: current-wayfinding-maps@1
gate:
  required: false
  candidate_selector: 'select("current-wayfinding-maps@1", {})'
  candidate_as: candidate
  obligation: candidate-gate-signoff@3
  completion: 'true'
`,
    );
    await fs.writeFile(
      path.join(packageRoot, "phases/phase-1-product-assurance.yaml"),
      `kind: phase-definition
id: phase-1-product-assurance
version: 3
order: 1
name: Noninitial progression profile
purpose: Prove prepared submission preserves the exact active Phase snapshot.
coverage: bootstrap-subset
omitted_capabilities: [all other lifecycle work]
entry: 'true'
scenarios: [record-consequential-decision@1]
obligations: []
outputs: [DEC]
progression:
  next_phase: phase-2-system-definition
  readiness: 'exists("current-wayfinding-maps@1", {})'
  authorization:
    condition: 'false'
    policy_ref: phase-progression-participation@1
    arguments: {phase: 'phase'}
    scenario: record-consequential-decision@1
    subjects: 'select("current-wayfinding-maps@1", {})'
    evidence_selector: applicable-disposition-decisions-for@1
gate:
  required: false
  candidate_selector: 'select("current-wayfinding-maps@1", {})'
  candidate_as: candidate
  obligation: candidate-gate-signoff@3
  completion: 'true'
`,
    );
    const participationPath = path.join(
      packageRoot,
      "policies/phase-progression-participation.yaml",
    );
    const participation = parse(await fs.readFile(participationPath, "utf8"));
    participation.rules = [];
    await fs.writeFile(participationPath, stringify(participation));
    const scenarioPath = path.join(
      packageRoot,
      "scenarios/record-consequential-decision.yaml",
    );
    const scenario = parse(await fs.readFile(scenarioPath, "utf8"));
    scenario.completion =
      `phase.id == "phase-1-product-assurance" && (${scenario.completion})`;
    await fs.writeFile(scenarioPath, stringify(scenario));

    const obligationsRoot = path.join(packageRoot, "obligations");
    for (const file of await fs.readdir(obligationsRoot)) {
      if (!file.endsWith(".yaml") || file === "initial-wayfinding-map-required.yaml") {
        continue;
      }
      const obligationPath = path.join(obligationsRoot, file);
      const obligation = parse(await fs.readFile(obligationPath, "utf8"));
      const phases = (obligation.phases as string[]).filter(
        (phase) =>
          phase !== "phase-0-wayfinding" &&
          phase !== "phase-1-product-assurance",
      );
      obligation.phases = phases.length > 0
        ? phases
        : ["phase-2-system-definition"];
      await fs.writeFile(obligationPath, stringify(obligation));
    }
    await recordInstalledPackageChange(repository, packageRoot);

    const foundation = await publishPreparedScenario(
      repository,
      "establish-initial-wayfinding-map@2",
      {
        outputs: [{
          localId: "map",
          name: "map",
          invocation: 0,
          lifecycleDatum: {
            type: "MAP",
            payload: {
              title: "Phase progression fixture",
              purpose: "Supply one exact progression authorization subject.",
              frontier: ["$proposal.product-intent.revision_id"],
            },
            links: [{
              type: "indexes",
              target: "$proposal.product-intent.id",
            }],
            body: "A progression authorization subject.\n",
          },
        }, {
          localId: "product-intent",
          name: "product_intent",
          invocation: 0,
          lifecycleDatum: {
            type: "QST",
            payload: {
              title: "Progression fixture product intent",
              kind: "preferential",
              intent_scope: "product",
              question: "Which exact product should this fixture pursue?",
              state: "open",
              blocking_impact: "PSP compilation waits for the attended answer.",
            },
            links: [],
            body: "The fixture records the required initial product intent.\n",
          },
        }],
        completionEvidence: { summary: "Progression subject proposed." },
      },
    );
    const mapRevision = foundation.outputs[0]!.lifecycleDatum.revisionId;

    const next = mdlm(repository, "next", "--json");

    expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
    const outcome = JSON.parse(next.stdout);
    expect(outcome).toEqual(expect.objectContaining({
      contract: "mdlm-next@1",
      phase: "phase-1-product-assurance@3",
      outcome: "attention-required",
      assignment: { id: expect.any(String) },
      authorityRequirement: {
        mode: "attended",
        authority: "stakeholder",
        delegationAllowed: false,
      },
      operatorInstructions: expect.objectContaining({
        contract: "mdlm-operator-instructions@1",
        action: "obtain-attention",
        disposition: "continuation",
        commands: expect.arrayContaining([
          `mdlm scenario prepare ${outcome.assignment.id} --json`,
        ]),
      }),
    }));
    const progressionPacket = await applicationMdlm(
      repository,
      "scenario",
      "prepare",
      outcome.assignment.id,
    );
    expect(
      progressionPacket.status,
      `${progressionPacket.stderr}${progressionPacket.stdout}`,
    ).toBe(0);
    const progression = JSON.parse(progressionPacket.stdout);
    expect(progression).toEqual(expect.objectContaining({
      phase: "phase-1-product-assurance@3",
      progression: {
        instance: "phase-progression:phase-1-product-assurance@3",
        nextPhase: "phase-2-system-definition",
        subjects: [mapRevision],
      },
      scenario: expect.objectContaining({
        reference: "record-consequential-decision@1",
      }),
      exactInputs: [expect.objectContaining({
        inputs: [expect.objectContaining({
          name: "subject",
          values: [expect.objectContaining({
            identity: expect.objectContaining({ revision_id: mapRevision }),
          })],
        })],
      })],
    }));

    const progressionSubmission = mdlmWithInputAndEnvironment(
      repository,
      `${JSON.stringify({
        contract: "mdlm-assignment-response@1",
        assignment: outcome.assignment.id,
        kind: "proposal",
        proposal: {
          outputs: [{
            localId: "decision",
            name: "decision",
            invocation: 0,
            lifecycleDatum: {
              type: "DEC",
              payload: {
                title: "Authorize package-declared Phase progression",
                kind: "scope",
                rationale: "The current Phase is ready and names this progression.",
                decision: "Proceed to the exact package-declared next Phase.",
                alternatives: ["Remain in the completed current Phase."],
                effective_scope: mapRevision,
              },
              links: [{ type: "justifies", target: mapRevision }],
              body: "The stakeholder authorizes this exact progression subject.\n",
            },
          }],
          completionEvidence: { summary: "Progression explicitly authorized." },
          loadedSkillRefs: progression.prompt.skills.map(
            (skill: { reference: string }) => skill.reference,
          ),
          authoritySupplies: ["stakeholder"],
          standingDelegations: [],
        },
      })}\n`,
      { MDLM_PERFORMANCE: "json" },
      "scenario",
      "submit",
    );
    expect(
      progressionSubmission.status,
      `${progressionSubmission.stderr}${progressionSubmission.stdout}`,
    ).toBe(0);
    expect(JSON.parse(progressionSubmission.stderr)).toMatchObject({
      contract: "mdlm-performance@1",
      repository: { loads: 1, markdownFiles: 2 },
      stages: { "lifecycle.evaluation": { count: 2 } },
      work: {
        "lifecycle.evaluation.snapshots": 3,
        "repository.parse.records": 2,
        "repository.provenance.records": 2,
        "repository.validation.records": 2,
      },
    });
    expect(JSON.parse(progressionSubmission.stdout)).toMatchObject({
      contract: "mdlm-scenario-execution@4",
      execution: {
        definition: { scenario: "record-consequential-decision@1" },
        response: { assignment: outcome.assignment.id },
        outputs: [{ data: { payload: { effective_scope: mapRevision } } }],
      },
    });
  }, PROCESS_REPOSITORY_TEST_TIMEOUT_MS);

  it("returns a declared Profile Boundary with omitted coverage and exact condition evidence", () => {
    const evaluation = terminalEvaluation("profile-boundary");
    expect(evaluation.phase).toEqual(expect.objectContaining({
      id: "phase-0-terminal",
      version: 1,
    }));
    expect(evaluation.diagnostics).toEqual([]);
    const classified = classifyTerminalEvaluation(evaluation);
    expect(classified.kind).toBe("profile-boundary-reached");
    if (classified.kind !== "profile-boundary-reached") return;

    const projected = operatorTerminalOutcomeProjection(classified);
    expect(projected).toEqual({
      outcome: "profile-boundary-reached",
      explanation: "This exact profile intentionally omits external breadth.",
      omittedCoverage: {
        profile: ["broader fixture coverage"],
        phase: ["external fixture work"],
      },
      evidence: {
        profile: "terminal@1",
        condition: {
          source: 'none("terminal-evidence@1", {}) && phase.id == "phase-0-terminal"',
          result: true,
          selectors: [{
            selector: "terminal-evidence@1",
            arguments: {},
            result: [],
          }],
        },
      },
    });
    const readableStatus = renderOperatorStatus({
      ...structuredClone(operatorStatusFoundation),
      currentOutcome: projected,
    });
    expect(readableStatus).toContain(
      "Current Operator Outcome: profile-boundary-reached",
    );
    expect(readableStatus).toContain("Terminal Evidence: terminal@1");
  });

  it("returns stop-success through compiled next for a declared terminal outcome", async () => {
    const terminalRepository = await terminalProcessRepository(parent, {
      profile_boundary: {
        condition: 'none("terminal-evidence@1", {}) && phase.id == "phase-0-terminal"',
        explanation: "This exact profile intentionally omits external breadth.",
      },
    });

    const next = mdlm(terminalRepository, "next", "--json");

    expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
    expect(JSON.parse(next.stdout)).toEqual(expect.objectContaining({
      contract: "mdlm-next@1",
      outcome: "profile-boundary-reached",
      operatorInstructions: expect.objectContaining({
        contract: "mdlm-operator-instructions@1",
        action: "stop-success",
        disposition: "successful-stop",
        commands: [],
      }),
    }));
  }, PROCESS_REPOSITORY_TEST_TIMEOUT_MS);

  it("returns Lifecycle Complete only from its explicit package condition", () => {
    const evaluation = terminalEvaluation("lifecycle-complete");
    expect(evaluation.diagnostics).toEqual([]);
    const classified = classifyTerminalEvaluation(evaluation);
    expect(classified.kind).toBe("lifecycle-complete");
    if (classified.kind !== "lifecycle-complete") return;

    expect(operatorTerminalOutcomeProjection(classified)).toEqual({
      outcome: "lifecycle-complete",
      explanation: "Every lifecycle objective selected by this package is complete.",
      evidence: {
        profile: "terminal@1",
        condition: {
          source: 'none("terminal-evidence@1", {}) && phase.id == "phase-0-terminal"',
          result: true,
          selectors: [{
            selector: "terminal-evidence@1",
            arguments: {},
            result: [],
          }],
        },
      },
    });
  });

  it("returns Invalid when exact terminal conditions are ambiguous", () => {
    const evaluation = terminalEvaluation("ambiguous");

    expect(evaluation.terminalOutcome).toBeNull();
    expect(evaluation.diagnostics).toEqual([
      expect.objectContaining({ code: "ambiguous-terminal-outcomes" }),
    ]);
  });

  it("returns versioned Invalid for malformed repository selection JSON", async () => {
    await initializeRepository();
    await fs.writeFile(
      path.join(repository, ".lifecycle/process-selection.json"),
      "{not-json\n",
    );

    const next = await applicationMdlm(repository, "next");

    expect(next.status).toBe(1);
    expect(JSON.parse(next.stdout)).toEqual(expect.objectContaining({
      ok: false,
      command: "next",
      contract: "mdlm-next@1",
      outcome: "invalid",
      integrity: { status: "invalid" },
      operatorInstructions: expect.objectContaining({
        action: "stop-failure",
        disposition: "unsuccessful-stop",
      }),
      diagnostics: [expect.objectContaining({
        code: "process-package-selection-invalid",
      })],
    }));
  });

  it("returns Invalid with a nonzero command status for integrity failure", async () => {
    await initializeRepository();
    await fs.appendFile(
      path.join(
        initializedPackageRoot(),
        "manifest.yaml",
      ),
      "\n# integrity failure\n",
    );

    const status = await applicationMdlm(repository, "status", "--json");
    expect(status.status).toBe(1);
    expect(JSON.parse(status.stdout)).toEqual(expect.objectContaining({
      contract: "mdlm-status@1",
      integrity: { status: "invalid" },
      currentOutcome: expect.objectContaining({ outcome: "invalid" }),
    }));
  });
});

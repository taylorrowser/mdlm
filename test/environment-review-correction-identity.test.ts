import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import {
  claimNextWork,
  submitAssignmentResponse,
  type AssignmentPacket,
} from "../src/assignment.js";
import { initializeRepositoryFromProcessPackage } from
  "../src/repository-initialization.js";

const processRoot = path.join(process.cwd(), ".lifecycle/process");
const temporaryRoots: string[] = [];
type JsonObject = Record<string, any>;

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    fs.rm(root, { recursive: true, force: true })
  ));
});

async function updateYaml(
  root: string,
  relativePath: string,
  update: (document: JsonObject) => void,
): Promise<void> {
  const file = path.join(root, relativePath);
  const document = parse(await fs.readFile(file, "utf8"));
  update(document);
  await fs.writeFile(file, stringify(document));
}

async function prepareFocusedPackage(packageRoot: string): Promise<void> {
  await fs.cp(processRoot, packageRoot, { recursive: true });
  await updateYaml(packageRoot, "phases/phase-0-wayfinding.yaml", (phase) => {
    phase.routing.status_order = [
      "stale",
      "ready",
      "awaiting-review",
      "failed",
      "blocked",
    ];
  });
  await updateYaml(
    packageRoot,
    "scenarios/establish-initial-wayfinding-map.yaml",
    (scenario) => {
      scenario.outputs = [
        { name: "product", types: ["PSP"], cardinality: "one", required_links: [] },
        {
          name: "requirement",
          types: ["STK"],
          cardinality: "one",
          required_links: [{ link: "derived-from", target: { output: "product" } }],
        },
        {
          name: "strategy",
          types: ["VSP"],
          cardinality: "one",
          required_links: [
            { link: "governs", target: { output: "requirement" } },
            { link: "governs-revision", target: { output: "requirement" } },
          ],
        },
        {
          name: "environment",
          types: ["ENV"],
          cardinality: "one",
          required_links: [{ link: "realizes", target: { output: "strategy" } }],
        },
        {
          name: "qualification_activity",
          types: ["VER"],
          cardinality: "one",
          required_links: [
            { link: "governed-by", target: { output: "strategy" } },
            { link: "qualifies", target: { output: "environment" } },
          ],
        },
        {
          name: "qualification_implementation",
          types: ["VAI"],
          cardinality: "one",
          required_links: [
            { link: "realizes", target: { output: "qualification_activity" } },
            { link: "uses", target: { output: "environment" } },
            { link: "targets", target: { output: "environment" } },
          ],
        },
      ];
      scenario.completion = "execution.integrity.contract_valid == true";
    },
  );
  for (const relativePath of [
    "obligations/phase-1-assurance-review-required.yaml",
    "obligations/environment-review-correction-required.yaml",
    "scenarios/review-phase-1-assurance.yaml",
    "scenarios/revise-environment-assurance-after-review.yaml",
  ]) {
    await updateYaml(packageRoot, relativePath, (definition) => {
      definition.phases.push("phase-0-wayfinding");
    });
  }
  await updateYaml(
    packageRoot,
    "obligations/phase-1-assurance-review-required.yaml",
    (obligation) => {
      obligation.status_rules = obligation.status_rules.filter(
        (rule: JsonObject) => rule.status !== "blocked",
      );
      obligation.status_rules.find(
        (rule: JsonObject) => rule.status === "awaiting-review",
      ).status = "stale";
      obligation.default_status = "stale";
    },
  );
  await updateYaml(
    packageRoot,
    "scenarios/review-phase-1-assurance.yaml",
    (scenario) => {
      scenario.completion = "execution.integrity.contract_valid == true";
    },
  );
  await updateYaml(
    packageRoot,
    "selectors/current-active-phase-verification-strategies.yaml",
    (selector) => {
      selector.query.where = selector.query.where.replace(
        '(phase.id == "phase-1-product-assurance"',
        '(phase.id in ["phase-0-wayfinding", "phase-1-product-assurance"]',
      );
    },
  );
  await updateYaml(
    packageRoot,
    "selectors/phase-1-assurance-review-required-revisions.yaml",
    (selector) => {
      selector.query.where = `subject.identity.type == "ENV" && (
${selector.query.where}
)`;
    },
  );
}

function authoredResponse(
  packet: AssignmentPacket,
  payloads: Record<string, Record<string, unknown>>,
): string {
  const response: JsonObject = structuredClone(packet.responseScaffold);
  response.proposal.outputs = response.proposal.outputs.map((output: JsonObject) =>
    Object.hasOwn(payloads, output.handle)
      ? { ...output, payload: payloads[output.handle], body: `# ${output.handle}\n` }
      : output
  );
  response.proposal.completionEvidence = { summary: "Complete focused transaction." };
  return JSON.stringify(response);
}

const capabilities = {
  controllability: ["literal argv", "stdin bytes"],
  observability: ["exit status", "stdout bytes", "stderr bytes"],
  external_services: [],
  timing: "bounded",
};

const environmentPayload = {
  title: "Literal command verification environment",
  rationale: "Retain exact executable bytes and literal qualification invocations.",
  strategy_revision: "$proposal.strategy.revision_id",
  profile_id: "literal-cli",
  capabilities,
  reproducibility: {
    environment_ref: "sha256:exact-executable-bytes",
    configuration_digest: `sha256:${"4".repeat(64)}`,
    reconstruction: "Use the exact executable bytes and literal argv from this ENV.",
  },
};

const qualificationActivityPayload = {
  title: "Qualify literal command execution",
  rationale: "Exercise the declared byte and invocation boundary.",
  kind: "qualification",
  method: "test",
  assessment_mode: "automatic",
  claim: {
    kind: "qualification",
    scope: "environment-capability",
    formal_evidence_eligible: false,
  },
  acceptance_criteria: ["Exact executable bytes run with literal argv."],
  evidence_requirements: ["Record resolvable byte-for-byte comparison evidence."],
  expected_success_activity: "Run the literal qualification invocation.",
  expected_discrimination_activity: "Compare changed executable bytes.",
};

function qualificationImplementationPayload(activity: string) {
  return {
    title: "Literal qualification implementation",
    rationale: "Bind the qualification to one exact activity.",
    kind: "qualification",
    implementation_ref: `procedure:sha256:${"5".repeat(64)}`,
    independence_mode: "environment-capability",
    authoring_input_refs: [activity],
    prohibited_inputs_observed: [
      "product source code",
      "product unit tests",
      "private implementation details",
      "uncontrolled implementation shortcuts",
    ],
    activity_bindings: [activity],
    target_behavior: {
      supported: ["Literal argv execution with exact executable bytes."],
      intentionally_unsupported: ["Mutable executable aliases."],
    },
  };
}

it("publishes an ENV Review correction in the exact environment lineage", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-env-review-correction-"));
  temporaryRoots.push(root);
  const repository = path.join(root, "repository");
  const packageRoot = path.join(root, "package");
  await prepareFocusedPackage(packageRoot);
  const initialized = await initializeRepositoryFromProcessPackage(repository, packageRoot);
  expect(initialized.ok, initialized.ok ? "" : JSON.stringify(initialized.diagnostics))
    .toBe(true);
  if (!initialized.ok) return;

  const initial = await claimNextWork(repository);
  expect(initial.ok, initial.ok ? "" : JSON.stringify(initial.diagnostics)).toBe(true);
  if (!initial.ok || initial.value.outcome !== "assignment") return;
  const initialPacket = initial.value.assignment.packet;
  const created = await submitAssignmentResponse(
    repository,
    authoredResponse(initialPacket, {
      product: {
        title: "Literal command product",
        rationale: "Define one observable command behavior.",
        problem: "Users need deterministic command output.",
        users: ["command-line user"],
        goals: ["Return the exact result."],
        non_goals: [],
        success_measures: ["The exact output bytes are observable."],
      },
      requirement: {
        title: "Return the exact result",
        rationale: "The output is the product boundary.",
        statement: "The product shall return the exact result.",
        verification_intent: "Observe exact output bytes.",
        stakeholder: "command-line user",
        priority: "must",
        system_context: "literal-command",
      },
      strategy: {
        title: "Black-box literal command strategy",
        rationale: "The command boundary is externally observable.",
        level: "stakeholder",
        permitted_methods: ["test"],
        independence: {
          boundary: "black-box",
          prohibited_inputs: [
            "product source code",
            "product unit tests",
            "private implementation details",
            "uncontrolled implementation shortcuts",
          ],
        },
        evidence_policy: "Record exact command bytes.",
        assessment_policy: "Compare observations byte for byte.",
        environment_profile: {
          id: "literal-cli",
          purpose: "Run one literal command.",
          capabilities,
        },
      },
      environment: environmentPayload,
      qualification_activity: qualificationActivityPayload,
      qualification_implementation: qualificationImplementationPayload(
        "$proposal.qualification_activity.revision_id",
      ),
    }),
  );
  expect(created.ok, created.ok ? "" : JSON.stringify(created.diagnostics)).toBe(true);
  if (!created.ok || created.value.outcome !== "accepted") return;
  const environment = created.value.receipt.publications.find(
    (publication) => publication.handle === "environment",
  )!;

  const review = await claimNextWork(repository);
  expect(review.ok, review.ok ? "" : JSON.stringify(review.diagnostics)).toBe(true);
  if (!review.ok || review.value.outcome !== "assignment") return;
  const reviewPacket = review.value.assignment.packet;
  expect(reviewPacket.scenario.reference).toBe("review-phase-1-assurance@1");
  const reviewed = await submitAssignmentResponse(
    repository,
    authoredResponse(reviewPacket, {
      context: {},
      review: {
        title: "Environment assurance Review",
        review_kind: "phase-1-assurance",
        reviewer: "independent-reviewer",
        summary: "The comparison evidence is not resolvable.",
        rubric_ref: "policies/rubrics/bootstrap-review.md@3",
        findings: [{
          id: "F-001",
          target: environment.revisionId,
          relationship: "primary",
          severity: "blocking",
          summary: "Name resolvable comparison evidence.",
          criterion: "Qualification evidence must be independently resolvable.",
          evidence: "The current reconstruction leaves the comparison implicit.",
          material_consequence: "The executable-byte claim cannot be checked.",
        }],
        correction_authority: "package-evidence",
        outcome: "fail",
      },
    }),
  );
  expect(reviewed.ok, reviewed.ok ? "" : JSON.stringify(reviewed.diagnostics)).toBe(true);
  if (!reviewed.ok || reviewed.value.outcome !== "accepted") return;
  const failedReview = reviewed.value.receipt.publications.find(
    (publication) => publication.handle === "review",
  )!;

  const correction = await claimNextWork(repository);
  expect(correction.ok, correction.ok ? "" : JSON.stringify(correction.diagnostics))
    .toBe(true);
  if (!correction.ok || correction.value.outcome !== "assignment") return;
  const correctionPacket = correction.value.assignment.packet;
  expect(correctionPacket.scenario.reference)
    .toBe("revise-environment-assurance-after-review@2");
  expect(correctionPacket.outputs.find((output) => output.handle === "replacement"))
    .toEqual(expect.objectContaining({ identity: { input: "environment" } }));
  const replacementPayload = {
    ...environmentPayload,
    strategy_revision: correctionPacket.exactInputs[0]!.inputs.find(
      (input) => input.name === "strategy",
    )!.values[0]!.identity.revision_id,
    reproducibility: {
      ...environmentPayload.reproducibility,
      reconstruction: "Use exact executable bytes, literal argv, and comparison:sha256:exact.",
    },
  };
  const submitted = await submitAssignmentResponse(
    repository,
    authoredResponse(correctionPacket, {
      replacement: replacementPayload,
      qualification_activity: qualificationActivityPayload,
      qualification_implementation: qualificationImplementationPayload(
        "$proposal.qualification_activity.revision_id",
      ),
    }),
  );

  expect(submitted.ok, submitted.ok ? "" : JSON.stringify(submitted.diagnostics)).toBe(true);
  if (!submitted.ok || submitted.value.outcome !== "accepted") return;
  expect(submitted.value.receipt.publications.find(
    (publication) => publication.handle === "replacement",
  )).toEqual(expect.objectContaining({
    stableId: environment.stableId,
    revisionId: `${environment.stableId}-r00002`,
  }));
  const execution = JSON.parse(await fs.readFile(path.join(
    repository,
    ".lifecycle/data/.transactions",
    submitted.value.settlement.execution,
    "execution.json",
  ), "utf8"));
  const replacement = execution.outputs.find(
    (output: JsonObject) => output.handle === "replacement",
  ).data;
  expect(replacement.payload).toEqual(replacementPayload);
  expect(replacement.links).toEqual(expect.arrayContaining([
    { type: "realizes", target: correctionPacket.exactInputs[0]!.inputs.find(
      (input) => input.name === "strategy",
    )!.values[0]!.identity.revision_id },
    { type: "corrects-review", target: failedReview.revisionId },
  ]));

  const advanced = await claimNextWork(repository);
  expect(advanced.ok, advanced.ok ? "" : JSON.stringify(advanced.diagnostics)).toBe(true);
  if (!advanced.ok || advanced.value.outcome !== "assignment") return;
  expect(advanced.value.assignment.id).not.toBe(correction.value.assignment.id);
  expect(advanced.value.assignment.packet.scenario.reference)
    .not.toBe("revise-environment-assurance-after-review@2");
});

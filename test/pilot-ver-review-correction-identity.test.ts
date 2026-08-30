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
          name: "activity",
          types: ["VER"],
          cardinality: "one",
          required_links: [
            { link: "verifies", target: { output: "requirement" } },
            { link: "verifies-revision", target: { output: "requirement" } },
            { link: "governed-by", target: { output: "strategy" } },
            { link: "derived-from", target: { output: "product" } },
          ],
        },
      ];
      scenario.completion = "execution.integrity.contract_valid == true";
    },
  );
  for (const relativePath of [
    "obligations/phase-1-assurance-review-required.yaml",
    "obligations/pilot-verification-activity-review-correction-required.yaml",
    "scenarios/review-phase-1-assurance.yaml",
    "scenarios/revise-pilot-verification-activity-after-review.yaml",
  ]) {
    await updateYaml(packageRoot, relativePath, (definition) => {
      definition.phases.push("phase-0-wayfinding");
    });
  }
  await updateYaml(
    packageRoot,
    "obligations/phase-1-assurance-review-required.yaml",
    (obligation) => {
      obligation.status_rules.find(
        (rule: JsonObject) => rule.status === "awaiting-review",
      ).status = "stale";
      obligation.default_status = "stale";
    },
  );
  await updateYaml(
    packageRoot,
    "obligations/pilot-verification-activity-review-correction-required.yaml",
    (obligation) => {
      obligation.status_rules[0].status = "stale";
      obligation.default_status = "stale";
    },
  );
  for (const relativePath of [
    "selectors/current-active-phase-verification-strategies.yaml",
    "selectors/current-pilot-verification-activities.yaml",
  ]) {
    await updateYaml(packageRoot, relativePath, (selector) => {
      selector.query.where = selector.query.where.replace(
        'phase.id == "phase-1-product-assurance"',
        'phase.id in ["phase-0-wayfinding", "phase-1-product-assurance"]',
      );
    });
  }
  await updateYaml(
    packageRoot,
    "selectors/phase-1-assurance-review-required-revisions.yaml",
    (selector) => {
      selector.query.where = `subject.identity.type == "VER" && (
${selector.query.where}
)`;
    },
  );
  await updateYaml(
    packageRoot,
    "selectors/pilot-intent-support-for-requirement.yaml",
    (selector) => {
      selector.query.where = `state(intent_support, "disposition") == "active"
&& !every("current-product-specifications-for-requirement@1",
  {requirement: requirement}, parent =>
    parent.identity.id != intent_support.identity.id)`;
    },
  );
}

function authoredResponse(
  packet: AssignmentPacket,
  payloads: Record<string, Record<string, unknown>>,
): string {
  const response: JsonObject = structuredClone(packet.responseScaffold);
  response.proposal.outputs = response.proposal.outputs.map((output: JsonObject) => ({
    ...output,
    payload: payloads[output.handle],
    body: `# ${output.handle}\n`,
  }));
  response.proposal.completionEvidence = { summary: "Focused public correction setup." };
  return JSON.stringify(response);
}

it("accepts a public pilot VER correction in the exact activity lineage", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-pilot-ver-correction-"));
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
  if (!initial.ok) return;
  expect(["assignment", "attention-required"]).toContain(initial.value.outcome);
  if (!(initial.value.outcome === "assignment" ||
    initial.value.outcome === "attention-required")) return;
  const initialPacket = initial.value.assignment.packet;
  expect(initialPacket.scenario.reference).toBe("establish-initial-wayfinding-map@2");
  const created = await submitAssignmentResponse(
    repository,
    authoredResponse(initialPacket, {
      product: {
        title: "Text predicate",
        rationale: "Define one observable text predicate.",
        problem: "Users need one deterministic predicate result.",
        users: ["command-line user"],
        goals: ["Report the predicate result."],
        non_goals: [],
        success_measures: ["The exact output is observable."],
      },
      requirement: {
        title: "Report the predicate result",
        rationale: "The output is the product boundary.",
        statement: "The product shall report the predicate result.",
        verification_intent: "Observe both predicate outcomes.",
        stakeholder: "command-line user",
        priority: "must",
        system_context: "text-predicate",
      },
      strategy: {
        title: "Black-box pilot strategy",
        rationale: "Both outcomes are externally observable.",
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
        evidence_policy: "Record exact command output.",
        assessment_policy: "Compare the observation with the requirement.",
        environment_profile: {
          id: "bounded-cli",
          purpose: "Run one bounded command.",
          capabilities: {
            controllability: ["arguments"],
            observability: ["stdout"],
            external_services: [],
            timing: "bounded",
          },
        },
      },
      activity: {
        title: "Pilot predicate verification",
        rationale: "Exercise both predicate outcomes.",
        kind: "pilot",
        method: "test",
        assessment_mode: "automatic",
        claim: {
          kind: "pilot",
          scope: "verification-design",
          formal_evidence_eligible: false,
        },
        acceptance_criteria: ["The expected output and an extra condition hold."],
        evidence_requirements: ["Record exact command output."],
        expected_success_activity: "Run a conforming target.",
        expected_discrimination_activity: "Run an incorrect control.",
      },
    }),
  );
  expect(created.ok, created.ok ? "" : JSON.stringify(created.diagnostics)).toBe(true);
  if (!created.ok || created.value.outcome !== "accepted") return;
  const activity = created.value.receipt.publications.find(
    (publication) => publication.handle === "activity",
  )!;

  const review = await claimNextWork(repository);
  expect(review.ok, review.ok ? "" : JSON.stringify(review.diagnostics)).toBe(true);
  if (!review.ok) return;
  expect(["assignment", "attention-required"]).toContain(review.value.outcome);
  if (!(review.value.outcome === "assignment" ||
    review.value.outcome === "attention-required")) return;
  const reviewPacket = review.value.assignment.packet;
  expect(reviewPacket.scenario.reference).toBe("review-phase-1-assurance@1");
  const reviewed = await submitAssignmentResponse(
    repository,
    authoredResponse(reviewPacket, {
      context: {},
      review: {
        title: "Pilot activity Review",
        review_kind: "phase-1-assurance",
        reviewer: "independent-reviewer",
        summary: "One acceptance condition exceeds the requirement.",
        rubric_ref: "policies/rubrics/bootstrap-review.md@3",
        findings: [{
          id: "F-001",
          target: activity.revisionId,
          relationship: "primary",
          severity: "blocking",
          summary: "Remove the extra condition.",
          criterion: "The activity must remain within its requirement.",
          evidence: "The activity adds an unstated condition.",
          material_consequence: "A conforming product could fail the pilot.",
        }],
        correction_authority: "package-evidence",
        outcome: "fail",
      },
    }),
  );
  expect(reviewed.ok, reviewed.ok ? "" : JSON.stringify(reviewed.diagnostics)).toBe(true);
  if (!reviewed.ok || reviewed.value.outcome !== "accepted") return;

  const correction = await claimNextWork(repository);
  expect(correction.ok, correction.ok ? "" : JSON.stringify(correction.diagnostics))
    .toBe(true);
  if (!correction.ok) return;
  expect(["assignment", "attention-required"]).toContain(correction.value.outcome);
  if (!(correction.value.outcome === "assignment" ||
    correction.value.outcome === "attention-required")) return;
  const correctionPacket = correction.value.assignment.packet;
  expect(correctionPacket.scenario.reference)
    .toBe("revise-pilot-verification-activity-after-review@3");
  expect(correctionPacket.outputs.find((output) => output.handle === "replacement"))
    .toEqual(expect.objectContaining({ identity: { input: "activity" } }));
  const correctionResponse: JsonObject = structuredClone(
    correctionPacket.responseScaffold,
  );
  const replacement = correctionResponse.proposal.outputs.find(
    (output: JsonObject) => output.handle === "replacement",
  )!;
  replacement.payload = {
    title: "Pilot predicate verification",
    rationale: "Exercise both predicate outcomes.",
    kind: "pilot",
    method: "test",
    assessment_mode: "automatic",
    claim: {
      kind: "pilot",
      scope: "verification-design",
      formal_evidence_eligible: false,
    },
    acceptance_criteria: ["Only the required output is observed."],
    evidence_requirements: ["Record exact command output."],
    expected_success_activity: "Run a conforming target.",
    expected_discrimination_activity: "Run an incorrect control.",
  };
  replacement.body = "The corrected activity removes the extra condition.\n";
  correctionResponse.proposal.completionEvidence = {
    summary: "The bounded correction is complete.",
  };
  const submitted = await submitAssignmentResponse(
    repository,
    JSON.stringify(correctionResponse),
  );

  expect(submitted.ok, submitted.ok ? "" : JSON.stringify(submitted.diagnostics)).toBe(true);
  if (!submitted.ok || submitted.value.outcome !== "accepted") return;
  expect(submitted.value.receipt.publications).toEqual([
    expect.objectContaining({
      handle: "replacement",
      stableId: activity.stableId,
      revisionId: `${activity.stableId}-r00002`,
    }),
  ]);
});

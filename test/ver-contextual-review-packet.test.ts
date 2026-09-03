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
      "awaiting-review",
      "ready",
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
    "obligations/review-context-required.yaml",
    "obligations/passing-review-required.yaml",
    "scenarios/create-review-context.yaml",
    "scenarios/review-datum-in-context.yaml",
  ]) {
    await updateYaml(packageRoot, relativePath, (definition) => {
      definition.phases.push("phase-0-wayfinding");
    });
  }
  await updateYaml(
    packageRoot,
    "obligations/review-context-required.yaml",
    (obligation) => {
      obligation.status_rules.find(
        (rule: JsonObject) => rule.status === "ready",
      ).status = "stale";
      obligation.default_status = "stale";
    },
  );
  await updateYaml(
    packageRoot,
    "selectors/review-required-revisions.yaml",
    (selector) => {
      selector.query.where = `subject.identity.type == "VER" && (\n${selector.query.where}\n)`;
    },
  );
}

function response(
  packet: AssignmentPacket,
  payloads: Record<string, Record<string, unknown>>,
): string {
  const proposed: JsonObject = structuredClone(packet.responseScaffold);
  proposed.proposal.outputs = proposed.proposal.outputs.map((output: JsonObject) => ({
    ...output,
    payload: payloads[output.handle] ?? {},
    body: `# ${output.handle}\n`,
  }));
  proposed.proposal.completionEvidence = {
    summary: "Create the focused public Review packet.",
  };
  return JSON.stringify(proposed);
}

function inputValues(packet: AssignmentPacket, name: string): JsonObject[] {
  return packet.exactInputs.flatMap((invocation) =>
    invocation.inputs.find((input) => input.name === name)?.values ?? []
  ) as JsonObject[];
}

it("gives a formal VER reviewer the exact requirement and mismatch rule", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-ver-review-packet-"));
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
  const created = await submitAssignmentResponse(
    repository,
    response(initial.value.assignment.packet, {
      product: {
        title: "Byte classifier",
        rationale: "Expose one deterministic command boundary.",
        problem: "Callers need classified input failures.",
        users: ["command-line caller"],
        goals: ["Report deterministic input failures."],
        non_goals: [],
        success_measures: ["Each supported failure has one observable result."],
      },
      requirement: {
        title: "Report input and output failures",
        rationale: "Callers need to distinguish infrastructure failure.",
        statement: "The product shall report input or output failure as IO_ERROR.",
        verification_intent: "Cause an input or output failure and observe IO_ERROR.",
        stakeholder: "command-line caller",
        priority: "must",
        system_context: "byte-classifier",
      },
      strategy: {
        title: "Black-box formal strategy",
        rationale: "The command result is externally observable.",
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
        evidence_policy: "Retain exact command output.",
        assessment_policy: "Compare the result with the exact requirement.",
        environment_profile: {
          id: "bounded-cli",
          purpose: "Run one bounded command.",
          capabilities: {
            controllability: ["arguments"],
            observability: ["stderr", "exit status"],
            external_services: [],
            timing: "bounded",
          },
        },
      },
      activity: {
        title: "Reject extra arguments",
        rationale: "Exercise invocation rejection.",
        kind: "formal",
        method: "test",
        assessment_mode: "automatic",
        claim: {
          kind: "formal",
          scope: "requirement",
          formal_evidence_eligible: true,
        },
        acceptance_criteria: ["Extra arguments produce USAGE."],
        evidence_requirements: ["Retain stderr and exit status."],
        expected_success_activity: "Invoke with one supported argument.",
        expected_discrimination_activity: "Invoke with an extra argument.",
        expected_observations: {
          "extra-argument": {
            stdin_base64: "",
            stdout_base64: "",
            stderr_base64: "VVNBR0U=",
            exit_status: 2,
            timed_out: false,
            truncated: false,
          },
        },
      },
    }),
  );
  expect(created.ok, created.ok ? "" : JSON.stringify(created.diagnostics)).toBe(true);
  if (!created.ok || created.value.outcome !== "accepted") return;
  const requirement = created.value.receipt.publications.find(
    (publication) => publication.handle === "requirement",
  )!;
  const activity = created.value.receipt.publications.find(
    (publication) => publication.handle === "activity",
  )!;

  const context = await claimNextWork(repository);
  expect(context.ok, context.ok ? "" : JSON.stringify(context.diagnostics)).toBe(true);
  if (!context.ok || context.value.outcome !== "assignment") return;
  expect(context.value.assignment.packet.scenario.reference).toBe("create-review-context@2");
  expect(inputValues(context.value.assignment.packet, "subject")[0]?.identity.revision_id)
    .toBe(activity.revisionId);
  const contextPublished = await submitAssignmentResponse(
    repository,
    response(context.value.assignment.packet, { context: {} }),
  );
  expect(
    contextPublished.ok,
    contextPublished.ok ? "" : JSON.stringify(contextPublished.diagnostics),
  ).toBe(true);
  if (!contextPublished.ok || contextPublished.value.outcome !== "accepted") return;

  const review = await claimNextWork(repository);
  expect(review.ok, review.ok ? "" : JSON.stringify(review.diagnostics)).toBe(true);
  if (!review.ok || review.value.outcome !== "assignment") return;
  const packet = review.value.assignment.packet;
  expect(packet.scenario.reference).toBe("review-datum-in-context@3");
  const exactRequirement = inputValues(packet, "context_members").find(
    (value) => value.identity?.revision_id === requirement.revisionId,
  );
  expect(exactRequirement?.payload).toMatchObject({
    statement: "The product shall report input or output failure as IO_ERROR.",
    verification_intent: "Cause an input or output failure and observe IO_ERROR.",
  });
  expect(packet.scenario.prompt.content).toContain("For a pilot or formal VER");
  expect(packet.scenario.prompt.content).toContain("linked through `verifies-revision`");
  expect(packet.scenario.prompt.content).toContain("requires `outcome: fail`");
  expect(JSON.stringify(packet.policies)).toContain("A wrong binding or");
  expect(JSON.stringify(packet.policies)).toContain("different observable behavior");
});

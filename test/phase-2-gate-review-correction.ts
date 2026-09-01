import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "vitest";
import { parse, stringify } from "yaml";
import {
  mdlm,
  mdlmWithInput,
  selectProcessPackageFixture,
} from "./helpers/mdlm.js";

type JsonObject = Record<string, any>;

function commit(repository: string, message: string): void {
  const added = spawnSync("git", ["-C", repository, "add", ".lifecycle"], {
    encoding: "utf8",
  });
  expect(added.status, added.stderr).toBe(0);
  const committed = spawnSync("git", [
    "-C",
    repository,
    "-c",
    "user.name=MDLM Test",
    "-c",
    "user.email=mdlm-test@localhost",
    "-c",
    "commit.gpgSign=false",
    "commit",
    "--quiet",
    "--no-verify",
    "-m",
    message,
  ], { encoding: "utf8" });
  expect(committed.status, `${committed.stderr}${committed.stdout}`).toBe(0);
}

async function gateCorrectionPackage(parent: string): Promise<string> {
  const root = path.join(parent, "process");
  await fs.cp(path.join(process.cwd(), ".lifecycle/process"), root, {
    recursive: true,
  });

  const gateScenarioPath = path.join(root, "scenarios/record-gate-signoff.yaml");
  const gateScenario = parse(await fs.readFile(gateScenarioPath, "utf8"));
  gateScenario.outputs.find(
    (output: JsonObject) => output.name === "decision",
  ).permitted_links.push({
    link: "justifies",
    target: { output: "decision" },
  });
  await fs.writeFile(gateScenarioPath, stringify(gateScenario));

  const profilePath = path.join(root, "profiles/bootstrap.yaml");
  const profile = parse(await fs.readFile(profilePath, "utf8"));
  profile.enabled.phases = ["phase-2-system-definition"];
  await fs.writeFile(profilePath, stringify(profile));

  const phasePath = path.join(root, "phases/phase-2-system-definition.yaml");
  const phase = parse(await fs.readFile(phasePath, "utf8"));
  phase.order = 0;
  phase.entry = "true";
  phase.attention_checkpoints = [];
  await fs.writeFile(phasePath, stringify(phase));
  for (const phaseId of [
    "phase-0-wayfinding",
    "phase-1-product-assurance",
    "phase-2-pilot-assessment",
    "phase-7-change-control",
  ]) {
    const otherPath = path.join(root, `phases/${phaseId}.yaml`);
    const other = parse(await fs.readFile(otherPath, "utf8"));
    other.order += 10;
    await fs.writeFile(otherPath, stringify(other));
  }

  const seedScenario = {
    kind: "scenario-definition",
    id: "seed-phase-2-gate-candidate",
    version: 1,
    description: "Publish one exact Phase 2 level candidate for the public correction regression.",
    phases: ["phase-2-system-definition"],
    inputs: [],
    outputs: [{
      name: "candidate",
      types: ["BSL"],
      cardinality: "one",
      required_links: [],
    }],
    prompt_ref: "prompts/seed-phase-2-gate-candidate.md@1",
    review_policy_ref: "review-applicability@1",
    completion: [
      "execution.integrity.contract_valid == true",
      '&& candidate.payload.kind == "level-candidate"',
      '&& candidate.payload.role == "candidate"',
      "&& candidate.storage.frozen == true",
    ].join(" "),
    resolves: ["seed-phase-2-gate-candidate-required"],
    prohibited_inputs: [],
    batching: "single",
  };
  const seedObligation = {
    kind: "obligation-definition",
    id: "seed-phase-2-gate-candidate-required",
    version: 1,
    description: "The public regression requires one exact Phase 2 level candidate.",
    phases: ["phase-2-system-definition"],
    for_each: "[phase]",
    subject_as: "required_phase",
    satisfied_when: 'exists("seeded-phase-2-gate-candidates@1", {})',
    status_rules: [{
      status: "ready",
      priority: 1000,
      when: 'none("seeded-phase-2-gate-candidates@1", {})',
      reason: "Publish the exact regression candidate.",
    }],
    default_status: "blocked",
    resolve_with: { scenario: "seed-phase-2-gate-candidate@1", inputs: {} },
    waiver_policy_ref: "waiver-applicability@1",
  };
  const seededCandidates = {
    kind: "selector-definition",
    id: "seeded-phase-2-gate-candidates",
    version: 1,
    description: "The current exact level candidate created by regression setup.",
    parameters: [],
    result_kind: "baseline",
    query: {
      from: { collection: "baselines", types: ["BSL"] },
      as: "candidate",
      where: [
        'candidate.provenance.scenario == "seed-phase-2-gate-candidate@1"',
        '&& candidate.payload.kind == "level-candidate"',
        '&& state(candidate, "disposition") == "active"',
      ].join(" "),
      distinct: true,
      order_by: ["identity.revision_id"],
    },
  };
  const completeCandidates = {
    ...seededCandidates,
    id: "complete-phase-2-level-candidates",
    description: "Treat the exact regression candidate as the completed Phase 2 definition.",
  };
  const gateCandidates = {
    ...seededCandidates,
    id: "gate-authorization-candidates",
    description: "Route the exact regression candidate to consequential gate authorization.",
  };
  const pilotCandidates = {
    ...seededCandidates,
    id: "candidates-with-suitable-representative-pilot",
    description: "Treat the regression candidate as carrying the bounded representative pilot setup.",
  };

  for (const [relative, value] of [
    ["scenarios/seed-phase-2-gate-candidate.yaml", seedScenario],
    ["obligations/seed-phase-2-gate-candidate-required.yaml", seedObligation],
    ["selectors/seeded-phase-2-gate-candidates.yaml", seededCandidates],
    ["selectors/complete-phase-2-level-candidates.yaml", completeCandidates],
    ["selectors/gate-authorization-candidates.yaml", gateCandidates],
    ["selectors/candidates-with-suitable-representative-pilot.yaml", pilotCandidates],
  ] as [string, unknown][]) {
    await fs.writeFile(path.join(root, relative), stringify(value));
  }
  await fs.writeFile(
    path.join(root, "prompts/seed-phase-2-gate-candidate.md"),
    "---\nid: seed-phase-2-gate-candidate\nversion: 1\nscenario: seed-phase-2-gate-candidate\n---\n\n# Seed the exact candidate\n",
  );
  return root;
}

function nextPacket(repository: string, expectedScenario: string): JsonObject {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const next = mdlm(repository, "next", "--json");
    expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
    const outcome = JSON.parse(next.stdout);
    const lifecycleChanges = spawnSync(
      "git",
      ["-C", repository, "status", "--porcelain", "--", ".lifecycle/data"],
      { encoding: "utf8" },
    );
    expect(lifecycleChanges.status, lifecycleChanges.stderr).toBe(0);
    if (outcome.outcome === "publication-required") {
      expect(outcome.assignment).toBeUndefined();
      expect(lifecycleChanges.stdout.trim()).not.toBe("");
      commit(repository, "Materialize exact Review Context");
      continue;
    }
    expect(
      lifecycleChanges.stdout.trim(),
      "mdlm next must not allocate an Assignment after materializing uncommitted Lifecycle Data",
    ).toBe("");
    expect(outcome.assignment, next.stdout).toBeDefined();
    expect(outcome.assignment.packet.scenario.reference).toBe(expectedScenario);
    return outcome.assignment.packet;
  }
  throw new Error(`Public route did not reach ${expectedScenario}`);
}

function input(packet: JsonObject, name: string): JsonObject[] {
  return packet.exactInputs[0].inputs.find(
    (candidate: JsonObject) => candidate.name === name,
  ).values;
}

function firstInput(packet: JsonObject, name: string): JsonObject {
  const value = input(packet, name)[0];
  expect(value, `Missing exact input '${name}'`).toBeDefined();
  return value!;
}

function submit(
  repository: string,
  packet: JsonObject,
  outputs: JsonObject[],
  authority?: string,
  expectedStatus = 0,
): JsonObject {
  const response = structuredClone(packet.responseScaffold);
  response.proposal.outputs = response.proposal.outputs.flatMap(
    (expected: JsonObject) => {
      const supplied = outputs.find(
        (candidate) => candidate.handle === expected.handle,
      );
      return supplied
        ? [{
            ...expected,
            payload: supplied.payload,
            ...(supplied.links ? { links: supplied.links } : {}),
            body: supplied.body,
          }]
        : [];
    },
  );
  response.proposal.completionEvidence = {
    summary: `Complete ${packet.scenario.reference}.`,
  };
  const arguments_ = ["scenario", "submit", "-", "--json"];
  if (authority) arguments_.splice(3, 0, "--authority", authority);
  const result = mdlmWithInput(
    repository,
    `${JSON.stringify(response)}\n`,
    ...arguments_,
  );
  expect(result.status, `${result.stderr}${result.stdout}`).toBe(expectedStatus);
  return JSON.parse(result.stdout);
}

function reviewOutput(
  packet: JsonObject,
  outcome: "pass" | "fail",
): JsonObject {
  const subject = firstInput(packet, "subject").identity.revision_id;
  return {
    handle: "review",
    payload: {
      title: `Review ${subject}`,
      review_kind: "contextual",
      reviewer: "independent-reviewer",
      summary: outcome === "pass"
        ? "The exact subject is coherent in its frozen context."
        : "The gate rationale does not state why the evidence supports progression.",
      rubric_ref: "policies/rubrics/bootstrap-review.md@3",
      findings: outcome === "pass" ? [] : [{
        id: "F-001",
        target: subject,
        relationship: "primary",
        severity: "blocking",
        summary: "State the evidence-based progression rationale.",
        criterion: "The gate Decision must justify its exact candidate judgment.",
        evidence: "The Decision names the candidate but omits the evidence judgment.",
        material_consequence: "Phase progression is not authorized.",
      }],
      ...(outcome === "fail" ? { correction_authority: "stakeholder" } : {}),
      outcome,
    },
    body: outcome === "pass"
      ? "The exact candidate passes independent Review.\n"
      : "The exact gate Decision requires renewed stakeholder judgment.\n",
  };
}

export async function runPhaseTwoGateReviewCorrection(): Promise<void> {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-phase2-gate-correction-"));
  try {
    const repository = path.join(parent, "repository");
    await fs.mkdir(repository);
    await selectProcessPackageFixture(repository, await gateCorrectionPackage(parent));

    const seed = nextPacket(repository, "seed-phase-2-gate-candidate@1");
    const seeded = submit(repository, seed, [{
      handle: "candidate",
      payload: {
        title: "Exact Phase 2 system candidate",
        kind: "level-candidate",
        role: "candidate",
        scope: "system",
        group: "DEFAULT",
        definition_members: [],
        evidence: [],
      },
      body: "One exact frozen Phase 2 system definition.\n",
    }]);
    const candidate = seeded.receipt.publications[0].revisionId;
    commit(repository, "Seed Phase 2 gate candidate");

    const candidateReview = nextPacket(repository, "review-datum-in-context@3");
    expect(firstInput(candidateReview, "subject").identity.revision_id).toBe(candidate);
    const reviewedCandidate = submit(
      repository,
      candidateReview,
      [reviewOutput(candidateReview, "pass")],
      "independent-reviewer",
    );
    const candidateReviewRevision = reviewedCandidate.receipt.publications[0].revisionId;
    commit(repository, "Review Phase 2 gate candidate");

    const gate = nextPacket(repository, "record-gate-signoff@3");
    expect(firstInput(gate, "candidate").identity.revision_id).toBe(candidate);
    const decisionScaffold = gate.responseScaffold.proposal.outputs.find(
      (output: JsonObject) => output.handle === "decision",
    );
    expect(decisionScaffold).toBeDefined();
    const justifies = [{ type: "justifies", target: { input: "candidate" } }];
    const blocks = { type: "blocks", target: { input: "candidate" } };
    const selfJustifies = {
      type: "justifies",
      target: { output: "decision" },
    };
    expect(gate.outputs.find(
      (output: JsonObject) => output.handle === "decision",
    )?.permittedLinks).toEqual([{
      link: "blocks",
      target: { input: "candidate" },
    }, {
      link: "justifies",
      target: { output: "decision" },
    }]);

    const rejectionRepository = path.join(parent, "rejection-repository");
    await fs.cp(repository, rejectionRepository, { recursive: true });
    const rejected = submit(rejectionRepository, gate, [{
      handle: "decision",
      payload: {
        title: "Reject the exact Phase 2 system candidate",
        kind: "gate-signoff",
        decision: "Reject the exact candidate.",
        rationale: "The candidate requires one exact correction.",
        alternatives: ["Approve the malformed candidate."],
        gate_outcome: "reject",
        gate_rejection: {
          findings: [{
            id: "G-001",
            summary: "The candidate contains one malformed definition.",
          }],
        },
        effective_scope: candidate,
      },
      links: [...justifies, blocks],
      body: "The stakeholder rejects this exact candidate.\n",
    }], "stakeholder");
    expect(decisionScaffold.links).toEqual([
      ...justifies,
      blocks,
      selfJustifies,
    ]);
    const rejectionDecision = rejected.receipt.publications.find(
      (publication: JsonObject) => publication.handle === "decision",
    ).revisionId;
    const shownRejection = mdlm(
      rejectionRepository,
      "show",
      rejectionDecision,
      "--json",
    );
    expect(shownRejection.status, `${shownRejection.stderr}${shownRejection.stdout}`)
      .toBe(0);
    expect(JSON.parse(shownRejection.stdout).lifecycleDatum.datum.links)
      .toEqual(expect.arrayContaining([
        { type: "justifies", target: candidate },
        { type: "blocks", target: candidate },
      ]));

    const approval = {
      handle: "decision",
      payload: {
        title: "Approve the exact Phase 2 system candidate",
        kind: "gate-signoff",
        decision: "Approve the exact candidate.",
        rationale: "Proceed with the exact frozen candidate.",
        alternatives: ["Reject and return the candidate for correction."],
        gate_outcome: "approve",
        effective_scope: candidate,
      },
      links: justifies,
      body: "The stakeholder approves this exact candidate.\n",
    };
    const missingRequired = submit(
      repository,
      gate,
      [{ ...approval, links: [] }],
      "stakeholder",
      1,
    );
    expect(missingRequired.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "assignment-response-links-invalid" }),
    ]));
    const signed = submit(repository, gate, [approval], "stakeholder");
    const failedDecision = signed.receipt.publications.find(
      (publication: JsonObject) => publication.handle === "decision",
    ).revisionId;
    commit(repository, "Record Phase 2 gate Decision");

    const decisionReview = nextPacket(repository, "review-datum-in-context@3");
    expect(firstInput(decisionReview, "subject").identity.revision_id).toBe(failedDecision);
    expect(input(decisionReview, "context_members").map(
      (value: JsonObject) => value.identity.revision_id,
    )).toContain(candidateReviewRevision);
    const failed = submit(
      repository,
      decisionReview,
      [reviewOutput(decisionReview, "fail")],
      "independent-reviewer",
    );
    const failedReview = failed.receipt.publications[0].revisionId;
    commit(repository, "Reject Phase 2 gate Decision in Review");

    const correction = nextPacket(
      repository,
      "revise-gate-signoff-after-review@2",
    );
    expect(firstInput(correction, "decision").identity.revision_id).toBe(failedDecision);
    expect(firstInput(correction, "candidate").identity.revision_id).toBe(candidate);
    expect(firstInput(correction, "candidate_review").identity.revision_id)
      .toBe(candidateReviewRevision);
    expect(input(correction, "lineage").map(
      (value: JsonObject) => value.identity.revision_id,
    )).toEqual([failedDecision]);
    expect(input(correction, "failed_reviews").map(
      (value: JsonObject) => value.identity.revision_id,
    )).toEqual([failedReview]);

    const replacement = submit(repository, correction, [{
      handle: "replacement",
      payload: {
        ...firstInput(correction, "decision").data.payload,
        rationale: "The passing candidate Review supports progression of this exact candidate.",
      },
      body: "Renewed stakeholder judgment cites the exact candidate evidence.\n",
    }], "stakeholder");
    const replacementRevision = replacement.receipt.publications[0].revisionId;
    expect(replacementRevision).toMatch(/-r00002$/);
    commit(repository, "Renew Phase 2 gate Decision");

    const renewedReview = nextPacket(repository, "review-datum-in-context@3");
    expect(firstInput(renewedReview, "subject").identity.revision_id)
      .toBe(replacementRevision);
    expect(input(renewedReview, "context_members").map(
      (value: JsonObject) => value.identity.revision_id,
    )).toEqual(expect.arrayContaining([
      candidateReviewRevision,
      failedDecision,
      failedReview,
    ]));
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
}

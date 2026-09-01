import { expect, it } from "vitest";
import {
  evaluateLifecycle,
  type LifecycleRecord,
} from "../src/index.js";
import { canonicalProcessPackage } from "./helpers/canonical-process-package-fixture.js";
import { frozenLifecycleRecord } from "./helpers/lifecycle-scenarios.js";
import {
  runPhaseTwoAssuranceReviewRoute,
  runPhaseTwoPlanningWithStakeholderStrategy,
} from
  "./helpers/proportional-phase-2-routes.js";
import { runPhaseTwoSimplificationReviewBinding } from
  "./helpers/phase-2-simplification-review-binding.js";
import {
  runPhaseTwoDefinitionConsistencySerialCorrection,
} from
  "./phase-2-review-correction-rendering.test.js";
import { runPhaseTwoAssuranceCorrectionPublic } from
  "./phase-2-assurance-correction-public.js";
import { runPhaseTwoGateReviewCorrection } from
  "./phase-2-gate-review-correction.js";

const processRef = "mdlm-bootstrap@0.74.0#coherent-phase-2-readiness";

function datum(
  type: string,
  id: string,
  payload: Record<string, unknown>,
  links: { type: string; target: string }[] = [],
): LifecycleRecord {
  return frozenLifecycleRecord(processRef, type, id, payload, { links });
}

it("groups one coherent stakeholder context into one ASP and DWP readiness route", async () => {
  const processPackage = await canonicalProcessPackage();

  const product = datum("PSP", "PSP-0COHERENT1", {
    title: "Coherent product",
    rationale: "Exercise grouped Phase 2 readiness.",
  });
  const requirement = (id: string, statement: string) => datum("STK", id, {
    title: statement,
    rationale: "One shared product responsibility.",
    statement,
    verification_intent: "Observe the shared product boundary.",
    stakeholder: "operator",
    priority: "must",
    system_context: "product",
  }, [{ type: "derived-from", target: product.datum.id }]);
  const first = requirement("STK-0COHERENT1", "Accept one valid value");
  const second = requirement("STK-0COHERENT2", "Reject one invalid value");
  const accepted = datum("BSL", "BSL-0COHERENT1", {
    title: "Accepted coherent intent",
    kind: "intent-approved",
    role: "accepted",
    scope: "coherent-product",
    group: "DEFAULT",
    definition_members: [product, first, second].map(
      (item) => item.datum.revision_id,
    ),
    evidence: [],
  });
  accepted.datum.created_by.scenario = "accept-phase-0-intent@1";

  const architecture = datum("ASP", "ASP-0COHERENT1", {
    title: "Shared product architecture",
    rationale: "One responsibility context owns both behaviors.",
    level: "system",
  }, [first, second].map((item) => ({
    type: "governs",
    target: item.datum.revision_id,
  })));
  const interfaceSpec = datum("ICSP", "ICSP-0COHERENT1", {
    title: "Controlled product boundary",
    rationale: "One actual shared boundary.",
    architecture_revision: architecture.datum.revision_id,
  }, [{
    type: "defines-interface-for",
    target: architecture.datum.revision_id,
  }]);
  const strategy = datum("VSP", "VSP-0COHERENT1", {
    title: "Shared verification strategy",
    rationale: "One black-box strategy covers both behaviors.",
    level: "stakeholder",
  }, [first, second].flatMap((item) => [
    { type: "governs", target: item.datum.id },
    { type: "governs-revision", target: item.datum.revision_id },
  ]));

  const snapshot = (records: LifecycleRecord[]) => evaluateLifecycle(
    processPackage,
    {
      processRef,
      phaseId: "phase-2-system-definition",
      records: [product, first, second, accepted, ...records],
      dependencyComparisons: [],
    },
  );
  const ready = (records: LifecycleRecord[], obligation: string) => snapshot(
    records,
  ).obligations.filter((item) =>
    item.obligation === obligation && item.status === "ready"
  );

  expect({
    architecture: ready([], "system-architecture-required"),
    planning: ready(
      [architecture, interfaceSpec, strategy],
      "decomposition-planning-required",
    ),
  }).toEqual({
    architecture: [expect.objectContaining({
      subject: first.datum.revision_id,
      actionableResolver: "define-system-architecture@3",
    })],
    planning: [expect.objectContaining({
      subject: first.datum.revision_id,
      actionableResolver: "define-decomposition-work-package@4",
    })],
  });
}, 420_000);

it("routes one reviewed Phase 2 completion directly to its level candidate", async () => {
  const processPackage = await canonicalProcessPackage();

  expect(processPackage.scenarios["create-decomposition-group-candidate"])
    .toBeUndefined();
  expect(processPackage.obligations["decomposition-group-candidate-required"])
    .toBeUndefined();

  const obligation = processPackage.obligations["system-level-candidate-required"] as unknown as {
    for_each: { source: string };
    subject_as: string;
    resolve_with: {
      scenario: string;
      inputs: Record<string, { source: string }>;
    };
  };
  expect(obligation.for_each.source).toBe(
    'select("current-decomposition-completions@1", {})',
  );
  expect(obligation.subject_as).toBe("completion");
  expect(obligation.resolve_with).toEqual(expect.objectContaining({
    scenario: "create-system-level-candidate@2",
    inputs: expect.objectContaining({
      completion: expect.objectContaining({ source: "completion" }),
    }),
  }));
  expect(obligation.resolve_with.inputs).not.toHaveProperty("group");

  const scenario = processPackage.scenarios["create-system-level-candidate"] as unknown as {
    version: number;
    inputs: Array<{ name: string }>;
    outputs: Array<{ required_links: unknown[] }>;
    completion: { source: string };
  };
  expect(scenario.version).toBe(2);
  expect(scenario.inputs.map((input) => input.name)).toEqual([
    "completion",
    "architecture",
    "interfaces",
    "verification_strategy",
  ]);
  expect(scenario.outputs[0]!.required_links).toEqual([]);
  expect(scenario.completion.source).toContain(
    'level-candidate-matches-completion@1',
  );
  expect(scenario.completion.source).not.toContain("group");
});

it("requires the exact system strategy before a Phase 2 level candidate", async () => {
  const processPackage = await canonicalProcessPackage();
  const stakeholder = datum("STK", "STK-0SYSTEMVSP", {
    title: "Observable stakeholder behavior",
  });
  const architecture = datum("ASP", "ASP-0SYSTEMVSP", {
    title: "System architecture",
    level: "system",
  }, [{ type: "governs", target: stakeholder.datum.revision_id }]);
  const stakeholderStrategy = datum("VSP", "VSP-0STAKEHOLD", {
    title: "Stakeholder strategy",
    level: "stakeholder",
  }, [{
    type: "governs-revision",
    target: stakeholder.datum.revision_id,
  }]);
  const plan = datum("DWP", "DWP-0SYSTEMVSP", {
    title: "System decomposition",
    stage: "planning",
    target_child_type: "SYS",
  }, [
    { type: "decomposes", target: stakeholder.datum.revision_id },
    { type: "allocated-to", target: architecture.datum.revision_id },
    { type: "verified-under", target: stakeholderStrategy.datum.revision_id },
  ]);
  const system = datum("SYS", "SYS-0SYSTEMVSP", {
    title: "Observable system behavior",
    statement: "The system shall report one exact result.",
  }, [{ type: "decomposes", target: plan.datum.revision_id }]);
  const simplificationContext = datum("BSL", "BSL-0SYSTEMVS1", {
    title: "System definition context",
    kind: "review-context",
    role: "review-context",
    scope: plan.datum.revision_id,
    group: "DEFAULT",
    definition_members: [
      architecture.datum.revision_id,
      plan.datum.revision_id,
      system.datum.revision_id,
    ],
    evidence: [],
  });
  const simplificationReview = datum("REV", "REV-0SYSTEMVS1", {
    title: "System simplification Review",
    review_kind: "simplification-architecture-interfaces",
    outcome: "pass",
  }, [{
    type: "contextualizes",
    target: simplificationContext.datum.revision_id,
  }]);
  const completion = datum("DWP", "DWP-0SYSTEMVSC", {
    title: "Completed system decomposition",
    stage: "completion",
    target_child_type: "SYS",
  }, [
    { type: "derived-from", target: plan.datum.revision_id },
    { type: "decomposes", target: stakeholder.datum.revision_id },
    { type: "produces", target: system.datum.revision_id },
    { type: "allocated-to", target: architecture.datum.revision_id },
    { type: "verified-under", target: stakeholderStrategy.datum.revision_id },
    { type: "justifies", target: simplificationReview.datum.revision_id },
  ]);
  const completionContext = datum("BSL", "BSL-0SYSTEMVS2", {
    title: "Completion Review context",
    kind: "review-context",
    role: "review-context",
    scope: completion.datum.revision_id,
    group: "DEFAULT",
    definition_members: [
      completion.datum.revision_id,
      architecture.datum.revision_id,
      plan.datum.revision_id,
      simplificationReview.datum.revision_id,
      stakeholder.datum.revision_id,
      stakeholderStrategy.datum.revision_id,
      system.datum.revision_id,
    ],
    evidence: [],
  });
  completionContext.datum.created_by.scenario = "create-review-context@2";
  const completionReview = datum("REV", "REV-0SYSTEMVS2", {
    title: "Completion Review",
    review_kind: "contextual",
    outcome: "pass",
  }, [
    { type: "reviews", target: completion.datum.revision_id },
    { type: "contextualizes", target: completionContext.datum.revision_id },
  ]);
  const records = [
    stakeholder,
    architecture,
    stakeholderStrategy,
    plan,
    system,
    simplificationContext,
    simplificationReview,
    completion,
    completionContext,
    completionReview,
  ];
  const snapshot = (extra: LifecycleRecord[] = []) => evaluateLifecycle(
    processPackage,
    {
      processRef,
      phaseId: "phase-2-system-definition",
      records: [...records, ...extra],
      dependencyComparisons: [],
    },
  );
  const candidate = (extra: LifecycleRecord[] = []) => snapshot(extra)
    .obligations.find((item) =>
      item.obligation === "system-level-candidate-required" &&
      item.subject === completion.datum.revision_id
    );

  expect(snapshot().obligations).toContainEqual(expect.objectContaining({
    obligation: "lower-level-verification-strategy-required",
    status: "ready",
  }));
  expect(candidate()).toEqual(expect.objectContaining({ status: "blocked" }));

  const systemStrategy = datum("VSP", "VSP-0SYSTEMVSP", {
    title: "System strategy",
    level: "system",
  }, [{ type: "governs-revision", target: system.datum.revision_id }]);
  expect(candidate([systemStrategy])).toEqual(expect.objectContaining({
    status: "ready",
    actionableResolver: "create-system-level-candidate@2",
  }));
  const candidateRequirement = processPackage.obligations[
    "system-level-candidate-required"
  ] as unknown as {
    resolve_with: { inputs: Record<string, { source: string }> };
  };
  expect(candidateRequirement.resolve_with.inputs.verification_strategy!.source)
    .toBe(
      'one("system-strategies-for-completion@1", {completion: completion})',
    );

  const levelCandidate = datum("BSL", "BSL-0SYSTEMVSP", {
    title: "Reviewed system candidate without pilot evidence",
    kind: "level-candidate",
    role: "candidate",
    scope: completion.datum.revision_id,
    group: "DEFAULT",
    definition_members: [
      completion.datum.revision_id,
      system.datum.revision_id,
      architecture.datum.revision_id,
      systemStrategy.datum.revision_id,
    ],
    evidence: [simplificationReview.datum.revision_id],
  });
  levelCandidate.datum.created_by.scenario = "create-system-level-candidate@2";
  const candidateContext = datum("BSL", "BSL-0SYSTEMVS3", {
    title: "System candidate Review Context",
    kind: "review-context",
    role: "review-context",
    scope: levelCandidate.datum.revision_id,
    group: "DEFAULT",
    definition_members: [levelCandidate.datum.revision_id],
    evidence: [],
  });
  candidateContext.datum.created_by.scenario = "create-review-context@2";
  const candidateReview = datum("REV", "REV-0SYSTEMVS3", {
    title: "Passing structural system candidate Review",
    review_kind: "contextual",
    outcome: "pass",
  }, [
    { type: "reviews", target: levelCandidate.datum.revision_id },
    { type: "contextualizes", target: candidateContext.datum.revision_id },
  ]);
  const withoutPilot = snapshot([
    systemStrategy,
    levelCandidate,
    candidateContext,
    candidateReview,
  ]);
  expect(withoutPilot.obligations.find((item) =>
    item.obligation === "candidate-gate-signoff" &&
    item.subject === levelCandidate.datum.revision_id
  )).toEqual(expect.objectContaining({
    status: "blocked",
    dispatchable: false,
  }));
});

it("routes the remaining system strategy after one Phase 2 acceptance", async () => {
  const processPackage = await canonicalProcessPackage();
  const stakeholder = datum("STK", "STK-0POSTACCEPT", {
    title: "Two-part stakeholder behavior",
  });
  const architecture = datum("ASP", "ASP-0POSTACCEPT", {
    title: "Shared system architecture",
    level: "system",
  }, [{ type: "governs", target: stakeholder.datum.revision_id }]);
  const stakeholderStrategy = datum("VSP", "VSP-0POSTACCEPT", {
    title: "Stakeholder strategy",
    level: "stakeholder",
  }, [{
    type: "governs-revision",
    target: stakeholder.datum.revision_id,
  }]);

  const completedDefinition = (
    suffix: string,
    completionId: string,
    definitionArchitecture: LifecycleRecord,
    completionRevision = 1,
  ) => {
    const plan = datum("DWP", `DWP-${suffix}PLAN`, {
      title: `${suffix} system decomposition`,
      stage: "planning",
      target_child_type: "SYS",
    }, [
      { type: "decomposes", target: stakeholder.datum.revision_id },
      {
        type: "allocated-to",
        target: definitionArchitecture.datum.revision_id,
      },
      { type: "verified-under", target: stakeholderStrategy.datum.revision_id },
    ]);
    const system = datum("SYS", `SYS-${suffix}REQ1`, {
      title: `${suffix} system requirement`,
      statement: `The ${suffix} system behavior shall be observable.`,
    }, [{ type: "decomposes", target: plan.datum.revision_id }]);
    const simplificationContext = datum("BSL", `BSL-${suffix}SIMP`, {
      title: `${suffix} simplification context`,
      kind: "review-context",
      role: "review-context",
      scope: plan.datum.revision_id,
      group: "DEFAULT",
      definition_members: [
        definitionArchitecture.datum.revision_id,
        plan.datum.revision_id,
        system.datum.revision_id,
      ],
      evidence: [],
    });
    const simplificationReview = datum("REV", `REV-${suffix}SIMP`, {
      title: `${suffix} simplification Review`,
      review_kind: "simplification-architecture-interfaces",
      outcome: "pass",
    }, [{
      type: "contextualizes",
      target: simplificationContext.datum.revision_id,
    }]);
    const completion = datum("DWP", completionId, {
      title: `${suffix} completed system decomposition`,
      stage: "completion",
      target_child_type: "SYS",
    }, [
      { type: "derived-from", target: plan.datum.revision_id },
      { type: "decomposes", target: stakeholder.datum.revision_id },
      { type: "produces", target: system.datum.revision_id },
      {
        type: "allocated-to",
        target: definitionArchitecture.datum.revision_id,
      },
      { type: "verified-under", target: stakeholderStrategy.datum.revision_id },
      { type: "justifies", target: simplificationReview.datum.revision_id },
    ]);
    completion.datum.revision = completionRevision;
    completion.datum.revision_id = `${completionId}-r${
      String(completionRevision).padStart(5, "0")
    }`;
    const completionContext = datum("BSL", `BSL-${suffix}COMP`, {
      title: `${suffix} completion Review context`,
      kind: "review-context",
      role: "review-context",
      scope: completion.datum.revision_id,
      group: "DEFAULT",
      definition_members: [
        completion.datum.revision_id,
        definitionArchitecture.datum.revision_id,
        plan.datum.revision_id,
        simplificationReview.datum.revision_id,
        stakeholder.datum.revision_id,
        stakeholderStrategy.datum.revision_id,
        system.datum.revision_id,
      ],
      evidence: [],
    });
    completionContext.datum.created_by.scenario = "create-review-context@2";
    const completionReview = datum("REV", `REV-${suffix}COMP`, {
      title: `${suffix} completion Review`,
      review_kind: "contextual",
      outcome: "pass",
    }, [
      { type: "reviews", target: completion.datum.revision_id },
      { type: "contextualizes", target: completionContext.datum.revision_id },
    ]);
    return {
      plan,
      system,
      simplificationContext,
      simplificationReview,
      completion,
      completionContext,
      completionReview,
      records: [
        plan,
        system,
        simplificationContext,
        simplificationReview,
        completion,
        completionContext,
        completionReview,
      ],
    };
  };

  const acceptedDefinition = completedDefinition(
    "FIRSTDEF01",
    "DWP-FIRSTDEF01",
    architecture,
  );
  const acceptedStrategy = datum("VSP", "VSP-FIRSTDEF01", {
    title: "Accepted system strategy",
    level: "system",
  }, [{
    type: "governs-revision",
    target: acceptedDefinition.system.datum.revision_id,
  }]);
  const candidate = datum("BSL", "BSL-FIRSTDEF01", {
    title: "First system candidate",
    kind: "level-candidate",
    role: "candidate",
    scope: acceptedDefinition.completion.datum.revision_id,
    group: "DEFAULT",
    definition_members: [
      acceptedDefinition.completion.datum.revision_id,
      acceptedDefinition.system.datum.revision_id,
      architecture.datum.revision_id,
      acceptedStrategy.datum.revision_id,
    ],
    evidence: [acceptedDefinition.simplificationReview.datum.revision_id],
  });
  candidate.datum.created_by.scenario = "create-system-level-candidate@2";
  const accepted = datum("BSL", "BSL-FIRSTACPT1", {
    title: "Accepted first system definition",
    kind: "level-accepted",
    role: "accepted",
    scope: acceptedDefinition.completion.datum.revision_id,
    group: "DEFAULT",
    definition_members: candidate.datum.payload.definition_members,
    evidence: [],
  }, [{ type: "promotes", target: candidate.datum.revision_id }]);
  accepted.datum.created_by.scenario = "accept-phase-2-system@1";

  const remainingArchitecture = datum("ASP", "ASP-VVYYA1BX3A", {
    title: "Remaining system architecture",
    level: "system",
  }, [{ type: "governs", target: stakeholder.datum.revision_id }]);
  const remainingDefinition = completedDefinition(
    "VVYYA1BX3A",
    "DWP-VVYYA1BX3A",
    remainingArchitecture,
    2,
  );
  const records = [
    stakeholder,
    architecture,
    stakeholderStrategy,
    ...acceptedDefinition.records,
    acceptedStrategy,
    candidate,
    accepted,
    remainingArchitecture,
    ...remainingDefinition.records,
  ];
  const evaluate = (extra: LifecycleRecord[] = []) => evaluateLifecycle(
    processPackage,
    {
      processRef,
      phaseId: "phase-2-system-definition",
      records: [...records, ...extra],
      dependencyComparisons: [],
    },
  );
  const postAcceptance = evaluate();
  expect(postAcceptance.looseEnds).toEqual(expect.arrayContaining([
    expect.objectContaining({
      obligation: "lower-level-verification-strategy-required",
      status: "ready",
      actionableResolver: "define-lower-level-verification-strategy@1",
      dispatchable: true,
      unresolvedBindings: [],
    }),
    expect.objectContaining({
      obligation: "system-level-candidate-required",
      subject: remainingDefinition.completion.datum.revision_id,
      status: "blocked",
      unresolvedBindings: ["verification_strategy"],
    }),
  ]));

  const remainingStrategy = datum("VSP", "VSP-VVYYA1BX3A", {
    title: "Remaining system strategy",
    level: "system",
  }, [{
    type: "governs-revision",
    target: remainingDefinition.system.datum.revision_id,
  }]);
  expect(evaluate([remainingStrategy]).obligations.find((item) =>
    item.obligation === "system-level-candidate-required" &&
    item.subject === remainingDefinition.completion.datum.revision_id
  )).toEqual(expect.objectContaining({
    status: "ready",
    actionableResolver: "create-system-level-candidate@2",
    dispatchable: true,
    unresolvedBindings: [],
  }));
});

it(
  "routes a reviewed Phase 2 architecture to planning with its stakeholder strategy",
  runPhaseTwoPlanningWithStakeholderStrategy,
  45_000,
);

it(
  "keeps shared assurance Review work in Phase 2 after public submit",
  runPhaseTwoAssuranceReviewRoute,
  120_000,
);

it(
  "accepts a Phase 2 simplification Review without a duplicate plan ID only in its exact context",
  runPhaseTwoSimplificationReviewBinding,
  30_000,
);

it(
  "corrects a definition-consistency set through five serial public Assignments",
  runPhaseTwoDefinitionConsistencySerialCorrection,
  90_000,
);

it(
  "renders four failed Phase 2 assurance corrections through public next",
  runPhaseTwoAssuranceCorrectionPublic,
  60_000,
);

it(
  "routes a failed Phase 2 gate Decision Review to renewed exact sign-off",
  runPhaseTwoGateReviewCorrection,
  45_000,
);

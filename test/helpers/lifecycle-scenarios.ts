import type { LifecycleRecord } from "../../src/index.js";
import { lifecycleRecord } from "./lifecycle-record.js";

export function frozenLifecycleRecord(
  processRef: string,
  type: string,
  id: string,
  payload: Record<string, unknown>,
  options: {
    links?: { type: string; target: string }[];
    scenario?: string;
  } = {},
): LifecycleRecord {
  return lifecycleRecord(type, id, payload, {
    ...(options.links ? { links: options.links } : {}),
    createdBy: {
      process_ref: processRef,
      ...(options.scenario ? { scenario: options.scenario } : {}),
    },
    storage: { editable: false, frozen: true },
  });
}

export function reviewedGateFixture(processRef: string) {
  const candidate = frozenLifecycleRecord(processRef, "BSL", "BSL-4K3M9Q2D8F", {
    title: "Intent candidate",
    kind: "intent-level-candidate",
    role: "candidate",
    scope: "intent",
    group: "DEFAULT",
    definition_members: [],
    evidence: [],
  }, { scenario: "create-candidate-baseline@1" });
  const candidateContext = frozenLifecycleRecord(
    processRef,
    "BSL",
    "BSL-4K3M9Q2D8G",
    {
      title: "Candidate review context",
      kind: "review-context",
      role: "review-context",
      scope: candidate.datum.revision_id,
      group: "DEFAULT",
      definition_members: [candidate.datum.revision_id],
      evidence: [],
    },
  );
  const candidateReview = frozenLifecycleRecord(processRef, "REV", "REV-4K3M9Q2D8F", {
    title: "Candidate review",
    review_kind: "simplification-product-definition",
    rubric_ref: "policies/rubrics/bootstrap-review.md@1",
    summary: "The exact candidate is the smallest sufficient product definition.",
    outcome: "pass",
  }, {
    links: [
      { type: "reviews", target: candidate.datum.revision_id },
      { type: "contextualizes", target: candidateContext.datum.revision_id },
    ],
  });
  const signoff = frozenLifecycleRecord(processRef, "DEC", "DEC-4K3M9Q2D8F", {
    title: "Intent gate sign-off",
    rationale: "Authorize this exact candidate.",
    kind: "gate-signoff",
    gate_outcome: "approve",
    decision: "Approve.",
    alternatives: ["Revise."],
    effective_scope: candidate.datum.revision_id,
  }, {
    links: [{ type: "justifies", target: candidate.datum.revision_id }],
  });
  const signoffContext = frozenLifecycleRecord(processRef, "BSL", "BSL-4K3M9Q2D8H", {
    title: "Sign-off review context",
    kind: "review-context",
    role: "review-context",
    scope: signoff.datum.revision_id,
    group: "DEFAULT",
    definition_members: [signoff.datum.revision_id],
    evidence: [],
  });
  const signoffReview = frozenLifecycleRecord(processRef, "REV", "REV-4K3M9Q2D8G", {
    title: "Sign-off review",
    review_kind: "independent",
    rubric_ref: "policies/rubrics/bootstrap-review.md@1",
    summary: "The exact sign-off passes review.",
    findings: [],
    outcome: "pass",
  }, {
    links: [
      { type: "reviews", target: signoff.datum.revision_id },
      { type: "contextualizes", target: signoffContext.datum.revision_id },
    ],
  });
  return {
    candidate,
    candidateContext,
    candidateReview,
    signoff,
    signoffContext,
    signoffReview,
    beforeSignoffReview: [
      candidate,
      candidateContext,
      candidateReview,
      signoff,
      signoffContext,
    ],
    records: [
      candidate,
      candidateContext,
      candidateReview,
      signoff,
      signoffContext,
      signoffReview,
    ],
  };
}

export function acceptedIntentForReviewedGate(
  processRef: string,
  fixture: ReturnType<typeof reviewedGateFixture>,
): LifecycleRecord {
  return frozenLifecycleRecord(
    processRef,
    "BSL",
    "BSL-4K3M9Q2D8J",
    {
      title: "Accepted intent",
      kind: "intent-approved",
      role: "accepted",
      scope: fixture.candidate.datum.payload.scope,
      group: fixture.candidate.datum.payload.group,
      definition_members: [],
      evidence: [
        fixture.candidateReview.datum.revision_id,
        fixture.signoff.datum.revision_id,
        fixture.signoffReview.datum.revision_id,
      ],
    },
    {
      links: [{
        type: "promotes",
        target: fixture.candidate.datum.revision_id,
      }],
      scenario: "accept-phase-0-intent@1",
    },
  );
}

export function exactContextWaiverFor(
  subject: LifecycleRecord,
  processRef: string,
) {
  const obligationInstance =
    `review-context-required@2:${subject.datum.revision_id}:${processRef}`;
  const waiver = frozenLifecycleRecord(processRef, "DEC", "DEC-8ZT5KQ3P9M", {
    title: "Temporary context waiver",
    rationale: "The context is temporarily disproportionate.",
    kind: "waiver",
    decision: "Waive context creation for this exact revision.",
    alternatives: ["Create the context now."],
    effective_scope: subject.datum.revision_id,
    waiver: {
      instance: obligationInstance,
      obligation: "review-context-required@2",
      subject: subject.datum.revision_id,
      scope: "this-revision",
      expires_when: ["subject-revised"],
    },
  }, { links: [{ type: "waives", target: obligationInstance }] });
  const review = frozenLifecycleRecord(processRef, "REV", "REV-2BC4DF6GHJ", {
    title: "Waiver review",
    rubric_ref: "policies/rubrics/bootstrap-review.md@1",
    findings: [],
    outcome: "pass",
  }, { links: [{ type: "reviews", target: waiver.datum.revision_id }] });
  return { obligationInstance, waiver, review };
}

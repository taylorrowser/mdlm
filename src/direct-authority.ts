import { isDeepStrictEqual } from "node:util";
import type { DirectContext, DirectProposal } from "./direct-contract.js";
import { buildDirectReviewContext } from "./direct-review-context.js";
import { registerExternalReview, requireExternalReview, type ExternalReviewProof } from "./external-review.js";
export { buildDirectReviewContext } from "./direct-review-context.js";

export interface DirectAuthorityEvidence {
  kind: "independent-review" | "stakeholder";
  name: string;
  source: "registered-review" | "authority-supply";
  review?: ExternalReviewProof;
}
function checkContext(context: DirectContext, proposal: DirectProposal): void {
  if (proposal.action !== `${context.action.id}@${context.action.version}` || proposal.snapshot !== context.snapshot || !isDeepStrictEqual(proposal.package, context.package) || proposal.subject !== context.subject || (proposal.inputs !== undefined && !isDeepStrictEqual(proposal.inputs, context.inputs))) throw new Error("Review proposal differs from its current exact action, package, snapshot or inputs");
}

/** Registration receives the independently authored candidate array or {candidates}. */
export async function registerDirectReview(root: string, context: DirectContext, proposalSource: string, verdictSource: string): Promise<ExternalReviewProof> {
  if (root !== context.root) throw new Error("Review repository differs from its context");
  if (context.action.authority?.kind !== "independent-review") throw new Error("This action does not require a registered independent review");
  const proposal = JSON.parse(proposalSource) as DirectProposal;
  checkContext(context, proposal);
  return registerExternalReview(root, proposal.operation, await buildDirectReviewContext(context), verdictSource, proposalSource);
}

/** Authority supply records operator assertion; it does not authenticate a human. */
export async function validateDirectAuthority(context: DirectContext, proposal: DirectProposal, proposalSource: string): Promise<DirectAuthorityEvidence | undefined> {
  checkContext(context, proposal);
  const requirement = context.action.authority;
  const supplied = proposal.evidence?.authority ?? [];
  if (!Array.isArray(supplied) || supplied.some(value => typeof value !== "string")) throw new Error("Authority supply must be an array of authority names");
  const authorities = [...new Set(supplied)];
  if (!requirement) {
    if (authorities.length || proposal.evidence?.review !== undefined) throw new Error("Autonomous work cannot claim authority or registered review evidence");
    return undefined;
  }
  if (authorities.some(value => value !== requirement.name)) throw new Error("Supplied authority differs from this exact action's required authority");
  if (requirement.kind === "independent-review") {
    const review = await requireExternalReview(context.root, proposal.operation, await buildDirectReviewContext(context), proposalSource);
    if (proposal.evidence?.review !== undefined && !isDeepStrictEqual(proposal.evidence.review, review)) throw new Error("Supplied review evidence differs from the manager-registered verdict");
    return {...requirement, source: "registered-review", review};
  }
  if (proposal.evidence?.review !== undefined) throw new Error("Independent review evidence cannot supply stakeholder authority");
  if (!authorities.includes(requirement.name)) throw new Error(`This action requires explicit authority from '${requirement.name}'`);
  return {...requirement, source: "authority-supply"};
}

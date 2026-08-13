import { promises as fs } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { evaluateLifecycle, loadProcessPackage, type ProcessPackage } from "../src/index.js";
import { evaluateScenarioParticipation } from "../src/evaluator.js";
import { frozenLifecycleRecord } from "./helpers/lifecycle-scenarios.js";

type Route = {
  route: string;
  selectors: string[];
  obligations: string[];
  participation: { mode: string; policies: string[]; authority: string };
  resolvers: string[];
  next: string[];
  budget: string;
  disposition: string;
  reuse: string;
};
type Matrix = { rows: Array<{ id: string; routes: Route[] }> };

const phase0Contracts = [
  "phase-0-foundation-publication::greenfield MAP|S=phase-0-foundation-members@1|O=initial-wayfinding-map-required@1|M=autonomous|P=|A=kernel-autonomous|R=establish-initial-wayfinding-map@1|N=assignment",
  "phase-0-foundation-publication::PSP|S=phase-0-foundation-members@1|O=product-specification-required@1|M=autonomous|P=|A=kernel-autonomous|R=compile-psp@2|N=assignment",
  "phase-0-foundation-publication::STK|S=phase-0-foundation-members@1|O=stakeholder-requirements-required@1|M=autonomous|P=|A=kernel-autonomous|R=draft-stakeholder-requirements@2|N=assignment",
  "phase-0-foundation-publication::candidate creation|S=complete-phase-0-intent-candidates@1|O=intent-candidate-required@2|M=autonomous|P=|A=kernel-autonomous|R=create-phase-0-intent-candidate@1|N=assignment",
  "phase-0-foundation-publication::accepted intent|S=phase-0-intent-approvals-for@1|O=intent-approval-required@1|M=autonomous|P=|A=kernel-autonomous|R=accept-phase-0-intent@1|N=assignment",
  "contextual-review::fresh Review Context|S=valid-review-contexts-for@1|O=review-context-required@2|M=autonomous|P=|A=kernel-autonomous|R=create-review-context@1|N=assignment",
  "contextual-review::passing independent Review|S=passing-reviews-for@1|O=passing-review-required@2|M=package-delegated|P=contextual-review-participation@1|A=independent-reviewer|R=review-datum-in-context@2|N=assignment",
  "contextual-review::failed independent Review|S=failing-reviews-for@1|O=passing-review-required@2|M=package-delegated|P=contextual-review-participation@1|A=independent-reviewer|R=review-datum-in-context@2|N=assignment",
  "phase-0-foundation-correction::initial failure|S=foundation-review-failures-at-stage@1,foundation-correction-history@1,failed-phase-0-foundation-revisions@2|O=foundation-review-correction-required@5|M=autonomous|P=|A=kernel-autonomous|R=revise-foundation-after-review@5|N=assignment",
  "phase-0-foundation-correction::first replacement|S=foundation-review-failures-at-stage@1,foundation-correction-history@1,failed-phase-0-foundation-revisions@2|O=foundation-review-correction-required@5|M=autonomous|P=|A=kernel-autonomous|R=revise-foundation-after-review@5|N=assignment",
  "phase-0-foundation-correction::second replacement|S=foundation-review-failures-at-stage@1,foundation-correction-history@1,failed-phase-0-foundation-revisions@2|O=foundation-review-correction-required@5|M=autonomous|P=|A=kernel-autonomous|R=revise-foundation-after-review@5|N=assignment",
  "phase-0-foundation-correction::stakeholder-owned failure|S=foundation-review-failures-at-stage@1,foundation-correction-history@1,failed-phase-0-foundation-revisions@2|O=foundation-review-escalation-required@2|M=attended|P=|A=stakeholder|R=escalate-foundation-review-correction@2|N=attention-required",
  "phase-0-foundation-correction::post-attended fresh cycles|S=foundation-review-failures-at-stage@1,foundation-correction-history@1,failed-phase-0-foundation-revisions@2|O=foundation-review-correction-required@5|M=autonomous|P=|A=kernel-autonomous|R=revise-foundation-after-review@5|N=assignment",
  "phase-0-simplification-correction::pass|S=valid-product-simplification-reviews@1,product-simplification-blockers-for-candidate@1,invalid-product-simplification-blockers-for-review@1,failed-intent-candidates@1|O=passing-review-required@2|M=package-delegated|P=contextual-review-participation@1|A=independent-reviewer|R=review-datum-in-context@2|N=attention-required",
  "phase-0-simplification-correction::member failure|S=valid-product-simplification-reviews@1,product-simplification-blockers-for-candidate@1,invalid-product-simplification-blockers-for-review@1,failed-intent-candidates@1|O=foundation-review-correction-required@5|M=autonomous|P=|A=kernel-autonomous|R=revise-foundation-after-review@5|N=assignment",
  "phase-0-simplification-correction::candidate failure|S=valid-product-simplification-reviews@1,product-simplification-blockers-for-candidate@1,invalid-product-simplification-blockers-for-review@1,failed-intent-candidates@1|O=intent-candidate-review-correction-required@3|M=autonomous|P=|A=kernel-autonomous|R=revise-intent-candidate-after-review@3|N=assignment",
  "phase-0-simplification-correction::stakeholder-owned failure|S=valid-product-simplification-reviews@1,product-simplification-blockers-for-candidate@1,invalid-product-simplification-blockers-for-review@1,failed-intent-candidates@1|O=intent-candidate-review-correction-required@3|M=attended|P=intent-candidate-correction-participation@1|A=stakeholder|R=revise-intent-candidate-after-review@3|N=attention-required",
  "phase-0-simplification-correction::malformed blocker|S=valid-product-simplification-reviews@1,product-simplification-blockers-for-candidate@1,invalid-product-simplification-blockers-for-review@1,failed-intent-candidates@1|O=passing-review-required@2|M=package-delegated|P=contextual-review-participation@1|A=independent-reviewer|R=review-datum-in-context@2|N=assignment",
  "phase-0-simplification-correction::exhausted candidate|S=valid-product-simplification-reviews@1,product-simplification-blockers-for-candidate@1,invalid-product-simplification-blockers-for-review@1,failed-intent-candidates@1|O=intent-candidate-review-correction-required@3|M=attended|P=intent-candidate-correction-participation@1|A=stakeholder|R=revise-intent-candidate-after-review@3|N=attention-required",
  "autonomous-question-source-boundary::source boundary before autonomous resolution|S=current-open-question-sources@1,source-boundaries-for@1,source-boundary-evidence@1|O=source-boundary-required@1|M=autonomous|P=|A=kernel-autonomous|R=freeze-source-boundary@1|N=assignment",
  "question-immediate-attention::immediate blocking|S=general-open-questions@1,blocked-targets-for-question@1,open-blocking-questions@1|O=open-question-resolution@3|M=attended-immediate|P=question-participation@1|A=stakeholder|R=resolve-question@2|N=attention-required",
  "prototype-question-answer::prototype answer|S=prototype-bound-open-questions@1,source-boundaries-for@1|O=prototype-question-resolution@1|M=autonomous|P=question-participation@1|A=evidence-authority|R=resolve-question-with-prototype@2|N=assignment",
  "question-deferral::defer|S=general-open-questions@1,question-disposition-decisions-for@1,applicable-question-dispositions-for@1|O=open-question-resolution@3|M=attended-immediate|P=question-participation@1|A=stakeholder|R=resolve-question@2|N=assignment",
  "question-cancellation::cancel|S=general-open-questions@1,question-disposition-decisions-for@1,applicable-question-dispositions-for@1|O=open-question-resolution@3|M=attended-immediate|P=question-participation@1|A=stakeholder|R=resolve-question@2|N=assignment",
  "preferential-question-answer::preferential answer|S=general-open-questions@1,question-answer-decisions-for@1,applicable-question-answers-for@1|O=open-question-resolution@3|M=attended-immediate|P=question-participation@1|A=stakeholder|R=resolve-question@2|N=assignment",
  "consequential-decision-correction::failed Question Decision Review|S=failed-question-decisions@1,failed-gate-signoff-decisions@1,failed-change-dispositions@1|O=question-decision-review-correction-required@1|M=attended|P=consequential-decision-participation@1|A=stakeholder|R=revise-question-decision-after-review@1|N=attention-required",
  "consequential-decision-correction::failed gate Decision Review|S=failed-question-decisions@1,failed-gate-signoff-decisions@1,failed-change-dispositions@1|O=gate-signoff-review-correction-required@2|M=attended|P=consequential-decision-participation@1|A=stakeholder|R=revise-gate-signoff-after-review@2|N=attention-required",
  "consequential-decision-correction::failed change disposition Review|S=failed-question-decisions@1,failed-gate-signoff-decisions@1,failed-change-dispositions@1|O=change-disposition-review-correction-required@1|M=attended|P=consequential-decision-participation@1|A=stakeholder|R=revise-change-disposition-after-review@1|N=attention-required",
  "phase-0-gate-rejection-return::approval|S=applicable-gate-signoffs-for@1,reviewed-gate-rejections-for-subject@1,gate-rejection-corrections-for-subject@1,complete-superseding-intent-candidates-for@1|O=candidate-gate-signoff@3|M=attended|P=gate-signoff-participation@1|A=stakeholder|R=record-gate-signoff@3|N=assignment",
  "phase-0-gate-rejection-return::reviewed rejection|S=applicable-gate-signoffs-for@1,reviewed-gate-rejections-for-subject@1,gate-rejection-corrections-for-subject@1,complete-superseding-intent-candidates-for@1|O=candidate-gate-signoff@3|M=autonomous|P=|A=kernel-autonomous|R=record-gate-signoff@3|N=assignment",
  "phase-0-gate-rejection-return::member correction|S=applicable-gate-signoffs-for@1,reviewed-gate-rejections-for-subject@1,gate-rejection-corrections-for-subject@1,complete-superseding-intent-candidates-for@1|O=foundation-review-correction-required@5|M=autonomous|P=|A=kernel-autonomous|R=revise-foundation-after-review@5|N=assignment",
  "phase-0-gate-rejection-return::candidate correction|S=applicable-gate-signoffs-for@1,reviewed-gate-rejections-for-subject@1,gate-rejection-corrections-for-subject@1,complete-superseding-intent-candidates-for@1|O=intent-candidate-review-correction-required@3|M=autonomous|P=|A=kernel-autonomous|R=revise-intent-candidate-after-review@3|N=assignment",
  "phase-0-gate-rejection-return::same-gate return|S=applicable-gate-signoffs-for@1,reviewed-gate-rejections-for-subject@1,gate-rejection-corrections-for-subject@1,complete-superseding-intent-candidates-for@1|O=candidate-gate-signoff@3|M=attended|P=gate-signoff-participation@1|A=stakeholder|R=record-gate-signoff@3|N=attention-required",
] as const;

const phase1Contracts = [
  "phase-1-assurance::VSP creation|S=current-phase-1-verification-strategies@1|O=verification-strategy-required@1|M=autonomous|P=|A=kernel-autonomous|R=define-verification-strategy@1|N=assignment",
  "phase-1-assurance::ENV qualification|S=complete-environment-assurance-for-strategy@1|O=environment-assurance-required@2|M=autonomous|P=|A=kernel-autonomous|R=realize-verification-environment@1|N=assignment",
  "phase-1-assurance::pilot VER|S=current-pilot-verification-activities@1|O=pilot-verification-activity-required@2|M=autonomous|P=|A=kernel-autonomous|R=write-verification-activity@1|N=assignment",
  "phase-1-assurance::passing independent Review|S=passing-reviews-for@1|O=passing-review-required@2|M=package-delegated|P=contextual-review-participation@1|A=independent-reviewer|R=review-datum-in-context@2|N=assignment",
  "phase-1-assurance::first and second correction|S=corrected-phase-1-assurance-reviews-for@1|O=verification-strategy-review-correction-required@2|M=autonomous|P=|A=kernel-autonomous|R=revise-verification-strategy-after-review@2|N=assignment",
  "phase-1-assurance::stakeholder-owned failure|S=corrected-phase-1-assurance-reviews-for@1|O=environment-review-correction-required@2|M=attended|P=phase-1-assurance-correction-participation@1|A=stakeholder|R=revise-environment-assurance-after-review@2|N=attention-required",
  "phase-1-assurance::malformed replacement|S=corrected-phase-1-assurance-reviews-for@1|O=verification-strategy-review-correction-required@2|M=autonomous|P=|A=kernel-autonomous|R=revise-verification-strategy-after-review@2|N=assignment",
  "phase-1-assurance::multiple VSP boundary|S=current-phase-1-verification-strategies@1|O=verification-strategy-required@1|M=autonomous|P=|A=kernel-autonomous|R=define-verification-strategy@1|N=profile-boundary-reached",
  "phase-1-assurance::multiple ENV boundary|S=complete-environment-assurance-for-strategy@1|O=environment-assurance-required@2|M=autonomous|P=|A=kernel-autonomous|R=realize-verification-environment@1|N=profile-boundary-reached",
  "phase-1-assurance::multiple pilot target boundary|S=current-pilot-verification-activities@1|O=pilot-verification-activity-required@2|M=autonomous|P=|A=kernel-autonomous|R=write-verification-activity@1|N=profile-boundary-reached",
  "phase-1-public-command-evidence::target registration|S=current-pilot-targets-for-requirement@1|O=pilot-target-required@1|M=autonomous|P=|A=kernel-autonomous|R=register-pilot-target@1|N=assignment",
  "phase-1-public-command-evidence::source-independent VAI|S=complete-pilot-implementations-for-activity@1|O=pilot-verification-implementation-required@1|M=package-delegated|P=verification-implementation-participation@1|A=independent-verification-implementer|R=implement-verification-activity@1|N=assignment",
  "phase-1-public-command-evidence::run|S=completed-runs-for-implementation@1|O=verification-run-required@1|M=autonomous|P=|A=kernel-autonomous|R=execute-verification-run@1|N=assignment",
  "phase-1-public-command-evidence::malformed command matrix|S=current-pilot-targets-for-requirement@1|O=pilot-target-required@1|M=autonomous|P=|A=kernel-autonomous|R=register-pilot-target@1|N=assignment",
  "phase-1-public-command-evidence::VAI correction|S=corrected-pilot-verification-implementation-revisions-for@1|O=pilot-vai-review-correction-required@1|M=autonomous|P=phase-1-assurance-correction-participation@1|A=package-evidence|R=revise-pilot-vai-after-review@1|N=assignment",
  "phase-1-public-command-evidence::timeout aggregation|S=completed-runs-for-implementation@1|O=verification-run-required@1|M=autonomous|P=|A=kernel-autonomous|R=execute-verification-run@1|N=assignment",
] as const;

const phase2Contracts = [
  "phase-2-definition-and-simplification::DWP plan|S=phase-2-definition-members-for-plan@1,review-context-members-for@1,valid-phase-2-simplification-review@1|O=decomposition-planning-required@1|M=autonomous|P=|A=kernel-autonomous|R=define-decomposition-work-package@2|N=assignment",
  "phase-2-definition-and-simplification::SYS outputs|S=phase-2-definition-members-for-plan@1,review-context-members-for@1,valid-phase-2-simplification-review@1|O=decomposition-execution-required@1|M=autonomous|P=|A=kernel-autonomous|R=execute-decomposition-work-package@2|N=assignment",
  "phase-2-definition-and-simplification::ASP|S=phase-2-definition-members-for-plan@1,review-context-members-for@1,valid-phase-2-simplification-review@1|O=system-architecture-required@1|M=autonomous|P=|A=kernel-autonomous|R=define-system-architecture@2|N=assignment",
  "phase-2-definition-and-simplification::plural ICSP|S=phase-2-definition-members-for-plan@1,review-context-members-for@1,valid-phase-2-simplification-review@1|O=interface-control-specification-required@1|M=autonomous|P=|A=kernel-autonomous|R=define-interface-control-specification@2|N=assignment",
  "phase-2-definition-and-simplification::earliest complete context|S=phase-2-definition-members-for-plan@1,review-context-members-for@1,valid-phase-2-simplification-review@1|O=decomposition-simplification-required@1|M=autonomous|P=|A=kernel-autonomous|R=simplify-requirement-set@2|N=assignment",
  "phase-2-definition-and-simplification::requirement simplification pass|S=phase-2-definition-members-for-plan@1,review-context-members-for@1,valid-phase-2-simplification-review@1|O=decomposition-simplification-required@1|M=package-delegated|P=contextual-review-participation@1|A=independent-reviewer|R=simplify-requirement-set@2|N=assignment",
  "phase-2-definition-and-simplification::architecture/interface simplification pass|S=phase-2-definition-members-for-plan@1,review-context-members-for@1,valid-phase-2-simplification-review@1|O=architecture-interface-simplification-required@1|M=package-delegated|P=contextual-review-participation@1|A=independent-reviewer|R=simplify-architecture-and-interfaces@2|N=assignment",
  "phase-2-simplification-correction::one SYS with several Findings|S=failed-phase-2-simplification-reviews-by-scope@1,phase-2-simplification-blockers-for-review@1,phase-2-removed-outputs-for-review@1|O=phase-2-simplification-correction-required@1|M=package-delegated|P=contextual-review-participation@1|A=independent-reviewer|R=revise-phase-2-subject-after-simplification@1|N=assignment",
  "phase-2-simplification-correction::exact consistency set|S=failed-phase-2-simplification-reviews-by-scope@1,phase-2-simplification-blockers-for-review@1,phase-2-removed-outputs-for-review@1|O=phase-2-definition-consistency-correction-required@1|M=autonomous|P=phase-2-correction-participation@1|A=package-evidence|R=revise-phase-2-definition-set-after-simplification@1|N=assignment",
  "phase-2-simplification-correction::scope reduction|S=failed-phase-2-simplification-reviews-by-scope@1,phase-2-simplification-blockers-for-review@1,phase-2-removed-outputs-for-review@1|O=phase-2-definition-consistency-correction-required@1|M=autonomous|P=phase-2-correction-participation@1|A=package-evidence|R=revise-phase-2-definition-set-after-simplification@1|N=assignment",
  "phase-2-simplification-correction::complete removal inability|S=failed-phase-2-simplification-reviews-by-scope@1,phase-2-simplification-blockers-for-review@1,phase-2-removed-outputs-for-review@1|O=phase-2-definition-consistency-correction-required@1|M=autonomous|P=phase-2-correction-participation@1|A=package-evidence|R=revise-phase-2-definition-set-after-simplification@1|N=assignment",
  "phase-2-simplification-correction::malformed blocker|S=failed-phase-2-simplification-reviews-by-scope@1,phase-2-simplification-blockers-for-review@1,phase-2-removed-outputs-for-review@1|O=phase-2-simplification-correction-required@1|M=package-delegated|P=contextual-review-participation@1|A=independent-reviewer|R=revise-phase-2-subject-after-simplification@1|N=assignment",
  "phase-2-review-correction-and-ambiguity::SYS|S=phase-2-correctable-subjects@1|O=phase-2-review-correction-required@1|M=autonomous|P=phase-2-correction-participation@1|A=package-evidence|R=revise-phase-2-subject-after-review@1|N=assignment",
  "phase-2-review-correction-and-ambiguity::ASP|S=phase-2-correctable-subjects@1|O=phase-2-review-correction-required@1|M=autonomous|P=phase-2-correction-participation@1|A=package-evidence|R=revise-phase-2-subject-after-review@1|N=assignment",
  "phase-2-review-correction-and-ambiguity::ICSP|S=phase-2-correctable-subjects@1|O=phase-2-review-correction-required@1|M=autonomous|P=phase-2-correction-participation@1|A=package-evidence|R=revise-phase-2-subject-after-review@1|N=assignment",
  "phase-2-review-correction-and-ambiguity::planning DWP|S=phase-2-correctable-subjects@1|O=phase-2-review-correction-required@1|M=autonomous|P=phase-2-correction-participation@1|A=package-evidence|R=revise-phase-2-subject-after-review@1|N=assignment",
  "phase-2-review-correction-and-ambiguity::completion DWP|S=phase-2-correctable-subjects@1|O=phase-2-review-correction-required@1|M=autonomous|P=phase-2-correction-participation@1|A=package-evidence|R=revise-phase-2-subject-after-review@1|N=assignment",
  "phase-2-review-correction-and-ambiguity::collateral Finding|S=phase-2-review-flags-subject@1|O=phase-2-review-correction-required@1|M=autonomous|P=phase-2-correction-participation@1|A=package-evidence|R=revise-phase-2-subject-after-review@1|N=assignment",
  "phase-2-review-correction-and-ambiguity::single-valued ambiguity|S=ambiguous-phase-2-subjects@1,phase-2-ambiguity-decisions-for@1|O=phase-2-ambiguity-resolution-required@1|M=attended|P=consequential-decision-participation@1|A=stakeholder|R=resolve-phase-2-ambiguity@1|N=attention-required",
  "phase-2-review-correction-and-ambiguity::exhausted correction|S=phase-2-correctable-subjects@1|O=phase-2-review-correction-required@1|M=attended|P=phase-2-correction-participation@1|A=stakeholder|R=revise-phase-2-subject-after-review@1|N=attention-required",
  "phase-2-candidate-gate-acceptance::DWP completion|S=valid-decomposition-completions-for-plan@1,complete-phase-2-group-candidates@1,complete-phase-2-level-candidates@1,applicable-gate-signoffs-for@1,system-acceptance-evidence-for-candidate@1|O=decomposition-completion-required@1|M=autonomous|P=|A=kernel-autonomous|R=complete-decomposition-work-package@2|N=assignment",
  "phase-2-candidate-gate-acceptance::group candidate|S=valid-decomposition-completions-for-plan@1,complete-phase-2-group-candidates@1,complete-phase-2-level-candidates@1,applicable-gate-signoffs-for@1,system-acceptance-evidence-for-candidate@1|O=decomposition-group-candidate-required@1|M=autonomous|P=|A=kernel-autonomous|R=create-decomposition-group-candidate@1|N=assignment",
  "phase-2-candidate-gate-acceptance::level candidate|S=valid-decomposition-completions-for-plan@1,complete-phase-2-group-candidates@1,complete-phase-2-level-candidates@1,applicable-gate-signoffs-for@1,system-acceptance-evidence-for-candidate@1|O=system-level-candidate-required@1|M=autonomous|P=|A=kernel-autonomous|R=create-system-level-candidate@1|N=assignment",
  "phase-2-candidate-gate-acceptance::candidate Review correction|S=valid-decomposition-completions-for-plan@1,complete-phase-2-group-candidates@1,complete-phase-2-level-candidates@1,applicable-gate-signoffs-for@1,system-acceptance-evidence-for-candidate@1|O=phase-2-candidate-correction-required@1|M=autonomous|P=phase-2-correction-participation@1|A=package-evidence|R=revise-phase-2-candidate-after-review@1|N=assignment",
  "phase-2-candidate-gate-acceptance::reviewed rejection|S=valid-decomposition-completions-for-plan@1,complete-phase-2-group-candidates@1,complete-phase-2-level-candidates@1,applicable-gate-signoffs-for@1,system-acceptance-evidence-for-candidate@1|O=phase-2-candidate-correction-required@1|M=autonomous|P=phase-2-correction-participation@1|A=package-evidence|R=revise-phase-2-candidate-after-review@1|N=assignment",
  "phase-2-candidate-gate-acceptance::gate return|S=valid-decomposition-completions-for-plan@1,complete-phase-2-group-candidates@1,complete-phase-2-level-candidates@1,applicable-gate-signoffs-for@1,system-acceptance-evidence-for-candidate@1|O=candidate-gate-signoff@3|M=attended-immediate|P=gate-signoff-participation@1|A=stakeholder|R=record-gate-signoff@3|N=attention-required",
  "phase-2-candidate-gate-acceptance::exact acceptance|S=valid-decomposition-completions-for-plan@1,complete-phase-2-group-candidates@1,complete-phase-2-level-candidates@1,applicable-gate-signoffs-for@1,system-acceptance-evidence-for-candidate@1|O=system-acceptance-required@1|M=autonomous|P=|A=kernel-autonomous|R=accept-phase-2-system@1|N=assignment",
  "phase-2-candidate-gate-acceptance::progression|S=valid-decomposition-completions-for-plan@1,complete-phase-2-group-candidates@1,complete-phase-2-level-candidates@1,applicable-gate-signoffs-for@1,system-acceptance-evidence-for-candidate@1|O=system-acceptance-required@1|M=autonomous|P=|A=kernel-autonomous|R=accept-phase-2-system@1|N=assignment",
  "phase-2-candidate-gate-acceptance::exhausted candidate correction|S=valid-decomposition-completions-for-plan@1,complete-phase-2-group-candidates@1,complete-phase-2-level-candidates@1,applicable-gate-signoffs-for@1,system-acceptance-evidence-for-candidate@1|O=phase-2-candidate-correction-required@1|M=attended-immediate|P=phase-2-correction-participation@1|A=stakeholder|R=revise-phase-2-candidate-after-review@1|N=attention-required",
] as const;

const pilotContracts = [
  "pilot-assessment::observation|S=complete-pilot-observations@1,complete-pilot-assessment-contexts@1,failed-current-pilot-assessments@1,corrected-pilot-assessments-for@1|O=pilot-observation-required@1|M=autonomous|P=|A=kernel-autonomous|R=record-pilot-observation@2|N=assignment",
  "pilot-assessment::assessment context|S=complete-pilot-observations@1,complete-pilot-assessment-contexts@1,failed-current-pilot-assessments@1,corrected-pilot-assessments-for@1|O=pilot-assessment-context-required@1|M=autonomous|P=|A=kernel-autonomous|R=prepare-pilot-assessment-context@1|N=assignment",
  "pilot-assessment::PAS|S=complete-pilot-observations@1,complete-pilot-assessment-contexts@1,failed-current-pilot-assessments@1,corrected-pilot-assessments-for@1|O=pilot-assessment-required@1|M=autonomous|P=|A=kernel-autonomous|R=assess-phase-0-2-pilot@1|N=assignment",
  "pilot-assessment::passing independent Review|S=passing-reviews-for@1|O=passing-review-required@2|M=package-delegated|P=contextual-review-participation@1|A=independent-reviewer|R=review-datum-in-context@2|N=attention-required",
  "pilot-assessment::first correction|S=complete-pilot-observations@1,complete-pilot-assessment-contexts@1,failed-current-pilot-assessments@1,corrected-pilot-assessments-for@1|O=pilot-assessment-review-correction-required@1|M=autonomous|P=|A=kernel-autonomous|R=revise-pilot-assessment-after-review@2|N=assignment",
  "pilot-assessment::second correction|S=complete-pilot-observations@1,complete-pilot-assessment-contexts@1,failed-current-pilot-assessments@1,corrected-pilot-assessments-for@1|O=pilot-assessment-review-correction-required@1|M=autonomous|P=|A=kernel-autonomous|R=revise-pilot-assessment-after-review@2|N=assignment",
  "pilot-assessment::stakeholder-owned failure|S=complete-pilot-observations@1,complete-pilot-assessment-contexts@1,failed-current-pilot-assessments@1,corrected-pilot-assessments-for@1|O=pilot-assessment-review-correction-required@1|M=attended|P=pilot-assessment-correction-participation@1|A=stakeholder|R=revise-pilot-assessment-after-review@2|N=attention-required",
  "pilot-assessment::exhausted correction|S=complete-pilot-observations@1,complete-pilot-assessment-contexts@1,failed-current-pilot-assessments@1,corrected-pilot-assessments-for@1|O=pilot-assessment-review-correction-required@1|M=attended|P=pilot-assessment-correction-participation@1|A=stakeholder|R=revise-pilot-assessment-after-review@2|N=attention-required",
  "expansion-decision-and-terminal-outcomes::Decision awaiting Review|S=recorded-pilot-expansion-decisions-for@1|O=passing-review-required@2|M=package-delegated|P=contextual-review-participation@1|A=independent-reviewer|R=review-datum-in-context@2|N=assignment",
  "expansion-decision-and-terminal-outcomes::failed Decision Review|S=recorded-pilot-expansion-decisions-for@1|O=pilot-expansion-decision-review-correction-required@1|M=attended|P=|A=stakeholder|R=revise-pilot-expansion-decision-after-review@1|N=attention-required",
  "expansion-decision-and-terminal-outcomes::proceed|S=pilot-expansion-decisions-for@1|O=pilot-expansion-decision-required@1|M=attended|P=|A=stakeholder|R=decide-pilot-expansion@2|N=profile-boundary-reached",
  "expansion-decision-and-terminal-outcomes::change|S=pilot-expansion-decisions-for@1|O=pilot-expansion-decision-required@1|M=attended|P=|A=stakeholder|R=decide-pilot-expansion@2|N=assignment",
  "expansion-decision-and-terminal-outcomes::stop|S=pilot-expansion-decisions-for@1|O=pilot-expansion-decision-required@1|M=attended|P=|A=stakeholder|R=decide-pilot-expansion@2|N=lifecycle-complete",
] as const;

const changeContracts = [
  "accepted-stakeholder-change::draft correction|S=accepted-intent-baselines-for-change@1,valid-stakeholder-change-impact@2,terminal-change-disposition-decisions-for@1,revised-requirements-for-change@3,stakeholder-change-closure-evidence-for@1|O=foundation-review-correction-required@5|M=autonomous|P=|A=kernel-autonomous|R=revise-foundation-after-review@5|N=assignment",
  "accepted-stakeholder-change::exact accepted boundary|S=accepted-intent-baselines-for-change@1,valid-stakeholder-change-impact@2,terminal-change-disposition-decisions-for@1,revised-requirements-for-change@3,stakeholder-change-closure-evidence-for@1|O=change-impact-required@1|M=autonomous|P=|A=kernel-autonomous|R=analyze-change-impact@2|N=assignment",
  "accepted-stakeholder-change::impact|S=accepted-intent-baselines-for-change@1,valid-stakeholder-change-impact@2,terminal-change-disposition-decisions-for@1,revised-requirements-for-change@3,stakeholder-change-closure-evidence-for@1|O=change-impact-required@1|M=autonomous|P=|A=kernel-autonomous|R=analyze-change-impact@2|N=assignment",
  "accepted-stakeholder-change::CHG correction|S=accepted-intent-baselines-for-change@1,valid-stakeholder-change-impact@2,terminal-change-disposition-decisions-for@1,revised-requirements-for-change@3,stakeholder-change-closure-evidence-for@1|O=stakeholder-change-review-correction-required@2|M=autonomous|P=stakeholder-change-correction-participation@2|A=package-evidence|R=revise-stakeholder-change-after-review@2|N=assignment",
  "accepted-stakeholder-change::approve|S=accepted-intent-baselines-for-change@1,valid-stakeholder-change-impact@2,terminal-change-disposition-decisions-for@1,revised-requirements-for-change@3,stakeholder-change-closure-evidence-for@1|O=change-approval-required@2|M=attended-immediate|P=consequential-decision-participation@1|A=stakeholder|R=approve-change-request@3|N=assignment",
  "accepted-stakeholder-change::reject|S=accepted-intent-baselines-for-change@1,valid-stakeholder-change-impact@2,terminal-change-disposition-decisions-for@1,revised-requirements-for-change@3,stakeholder-change-closure-evidence-for@1|O=change-approval-required@2|M=attended-immediate|P=consequential-decision-participation@1|A=stakeholder|R=approve-change-request@3|N=profile-boundary-reached",
  "accepted-stakeholder-change::defer|S=accepted-intent-baselines-for-change@1,valid-stakeholder-change-impact@2,terminal-change-disposition-decisions-for@1,revised-requirements-for-change@3,stakeholder-change-closure-evidence-for@1|O=change-approval-required@2|M=attended-immediate|P=consequential-decision-participation@1|A=stakeholder|R=approve-change-request@3|N=profile-boundary-reached",
  "accepted-stakeholder-change::cancel|S=accepted-intent-baselines-for-change@1,valid-stakeholder-change-impact@2,terminal-change-disposition-decisions-for@1,revised-requirements-for-change@3,stakeholder-change-closure-evidence-for@1|O=change-approval-required@2|M=attended-immediate|P=consequential-decision-participation@1|A=stakeholder|R=approve-change-request@3|N=profile-boundary-reached",
  "accepted-stakeholder-change::replacement|S=accepted-intent-baselines-for-change@1,valid-stakeholder-change-impact@2,terminal-change-disposition-decisions-for@1,revised-requirements-for-change@3,stakeholder-change-closure-evidence-for@1|O=change-revision-required@2|M=autonomous|P=|A=kernel-autonomous|R=revise-requirement-under-change@3|N=assignment",
  "accepted-stakeholder-change::candidate|S=accepted-intent-baselines-for-change@1,valid-stakeholder-change-impact@2,terminal-change-disposition-decisions-for@1,revised-requirements-for-change@3,stakeholder-change-closure-evidence-for@1|O=stakeholder-change-candidate-required@1|M=autonomous|P=|A=kernel-autonomous|R=create-stakeholder-change-candidate@1|N=assignment",
  "accepted-stakeholder-change::closure|S=accepted-intent-baselines-for-change@1,valid-stakeholder-change-impact@2,terminal-change-disposition-decisions-for@1,revised-requirements-for-change@3,stakeholder-change-closure-evidence-for@1|O=change-closure-required@2|M=autonomous|P=|A=kernel-autonomous|R=close-change-request@4|N=profile-boundary-reached",
  "shared-system-change::two exact consumers|S=system-requirements-consumed-by@1,shared-system-consumers-for-change@1,outdated-shared-system-consumers@2,shared-system-change-contexts@1|O=shared-system-consumer-reevaluation-required@1|M=autonomous|P=|A=kernel-autonomous|R=reevaluate-shared-system-consumer@1|N=assignment",
  "shared-system-change::draft replacement|S=system-requirements-consumed-by@1,shared-system-consumers-for-change@1,outdated-shared-system-consumers@2,shared-system-change-contexts@1|O=change-revision-required@2|M=autonomous|P=|A=kernel-autonomous|R=revise-requirement-under-change@3|N=assignment",
  "shared-system-change::serial draft reevaluation|S=system-requirements-consumed-by@1,shared-system-consumers-for-change@1,outdated-shared-system-consumers@2,shared-system-change-contexts@1|O=shared-system-consumer-reevaluation-required@1|M=autonomous|P=|A=kernel-autonomous|R=reevaluate-shared-system-consumer@1|N=assignment",
  "shared-system-change::accepted impact|S=system-requirements-consumed-by@1,shared-system-consumers-for-change@1,outdated-shared-system-consumers@2,shared-system-change-contexts@1|O=change-impact-required@1|M=autonomous|P=|A=kernel-autonomous|R=analyze-change-impact@2|N=attention-required",
  "shared-system-change::approved replacement|S=system-requirements-consumed-by@1,shared-system-consumers-for-change@1,outdated-shared-system-consumers@2,shared-system-change-contexts@1|O=change-revision-required@2|M=autonomous|P=|A=kernel-autonomous|R=revise-requirement-under-change@3|N=assignment",
  "shared-system-change::serial accepted reevaluation|S=system-requirements-consumed-by@1,shared-system-consumers-for-change@1,outdated-shared-system-consumers@2,shared-system-change-contexts@1|O=shared-system-consumer-reevaluation-required@1|M=autonomous|P=|A=kernel-autonomous|R=reevaluate-shared-system-consumer@1|N=assignment",
  "shared-system-change::selective candidate|S=system-requirements-consumed-by@1,shared-system-consumers-for-change@1,outdated-shared-system-consumers@2,shared-system-change-contexts@1|O=stakeholder-change-candidate-required@1|M=autonomous|P=|A=kernel-autonomous|R=create-stakeholder-change-candidate@1|N=assignment",
  "shared-system-change::closure|S=system-requirements-consumed-by@1,shared-system-consumers-for-change@1,outdated-shared-system-consumers@2,shared-system-change-contexts@1|O=change-closure-required@2|M=autonomous|P=|A=kernel-autonomous|R=close-change-request@4|N=profile-boundary-reached",
] as const;


const processRef = "mdlm-bootstrap@0.59.0#sha256:hardening-contracts";
const rev = (id: string, revision = 1) => `${id}-r${String(revision).padStart(5, "0")}`;

function record(
  type: string,
  id: string,
  payload: Record<string, unknown>,
  links: Array<{ type: string; target: string }> = [],
  scenario?: string,
  revision = 1,
) {
  const result = frozenLifecycleRecord(processRef, type, id, payload, {
    links,
    ...(scenario ? { scenario } : {}),
  });
  result.datum.revision = revision;
  result.datum.revision_id = rev(id, revision);
  return result;
}

function requirement(title: string) {
  return {
    title,
    rationale: "Exact bounded requirement.",
    statement: title,
    verification_intent: "Inspect exact behavior.",
  };
}

describe("Phase-hardening domain route contracts", () => {
  let processPackage: ProcessPackage;
  let matrix: Matrix;

  beforeAll(async () => {
    const loaded = await loadProcessPackage(path.join(process.cwd(), ".lifecycle/process"));
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
    processPackage = loaded.package;
    matrix = parse(await fs.readFile("docs/phase-hardening-matrix.yaml", "utf8")) as Matrix;
  });

  const selectedRows = (ids: string[]) => matrix.rows.filter((row) => ids.includes(row.id));
  const routes = (ids: string[]) => selectedRows(ids).flatMap((row) => row.routes);
  const routeContracts = (ids: string[]) => selectedRows(ids).flatMap((row) =>
    row.routes.map((route) =>
      `${row.id}::${route.route}|S=${route.selectors.join(",")}|O=${route.obligations.join(",")}` +
      `|M=${route.participation.mode}|P=${route.participation.policies.join(",")}` +
      `|A=${route.participation.authority}|R=${route.resolvers.join(",")}|N=${route.next.join(",")}`
    )
  );

  function expectCompleteRoutes(domainRoutes: Route[], expectedNames: string[]) {
    expect(domainRoutes.map((route) => route.route)).toEqual(expectedNames);
    for (const route of domainRoutes) {
      expect(route.selectors.length, route.route).toBeGreaterThan(0);
      expect(route.obligations.length, route.route).toBeGreaterThan(0);
      expect(route.resolvers, route.route).toHaveLength(1);
      expect(route.next, route.route).toHaveLength(1);
      expect(route.next, route.route).not.toContain("process-dead-end");
      expect(route.budget, route.route).not.toBe("");
      expect(route.disposition, route.route).not.toBe("");
      expect(route.reuse, route.route).not.toBe("");
    }
  }

  it("proves Phase 0 foundation, question, Review, correction, and gate routes semantically", () => {
    const product = record("PSP", "PSP-HARDEN0001", {
      title: "Bounded product",
      rationale: "Discover exact Review work.",
      problem: "Intent needs independent judgment.",
      users: ["operator"],
      goals: ["preserve exact intent"],
      non_goals: [],
      success_measures: ["review is dispatchable"],
    }, [], "compile-psp@2");
    const evaluation = evaluateLifecycle(processPackage, {
      processRef,
      phaseId: "phase-0-wayfinding",
      records: [product],
      dependencyComparisons: [],
    });
    expect(evaluation.looseEnds.find((item) =>
      item.obligation === "review-context-required" && item.subject === product.datum.revision_id
    )).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "create-review-context@1",
    }));
    expect(evaluation.looseEnds.find((item) =>
      item.obligation === "passing-review-required" && item.subject === product.datum.revision_id
    )).toEqual(expect.objectContaining({
      status: "blocked",
      actionableResolver: "create-review-context@1",
    }));
    const phaseIds = [
      "phase-0-foundation-publication", "contextual-review", "phase-0-foundation-correction",
      "phase-0-simplification-correction", "autonomous-question-source-boundary",
      "question-immediate-attention", "prototype-question-answer", "question-deferral",
      "question-cancellation", "preferential-question-answer", "consequential-decision-correction",
      "phase-0-gate-rejection-return",
    ];
    const domainRoutes = routes(phaseIds);
    expect(routeContracts(phaseIds)).toEqual(phase0Contracts);
    expectCompleteRoutes(domainRoutes, domainRoutes.map((route) => route.route));
    expect(domainRoutes.find((route) => route.route === "initial failure")).toMatchObject({
      participation: { mode: "autonomous", policies: [], authority: "kernel-autonomous" },
      resolvers: ["revise-foundation-after-review@5"],
      next: ["assignment"],
    });
  });

  it("proves Phase 1 assurance execution, correction, and boundary routes semantically", () => {
    const phaseIds = ["phase-1-assurance", "phase-1-public-command-evidence"];
    const domainRoutes = routes(phaseIds);
    expect(routeContracts(phaseIds)).toEqual(phase1Contracts);
    expectCompleteRoutes(domainRoutes, [
      "VSP creation", "ENV qualification", "pilot VER", "passing independent Review",
      "first and second correction", "stakeholder-owned failure", "malformed replacement",
      "multiple VSP boundary", "multiple ENV boundary", "multiple pilot target boundary",
      "target registration", "source-independent VAI", "run", "malformed command matrix",
      "VAI correction", "timeout aggregation",
    ]);
    const correction = domainRoutes.find((route) => route.route === "first and second correction")!;
    expect(correction).toMatchObject({
      participation: { mode: "autonomous", authority: "kernel-autonomous" },
      resolvers: ["revise-verification-strategy-after-review@2"],
      next: ["assignment"],
    });
    expect(domainRoutes.filter((route) => route.route.startsWith("multiple "))
      .every((route) => route.next[0] === "profile-boundary-reached")).toBe(true);
  });

  it("proves Phase 2 completion, correction, candidate, acceptance, and progression routes semantically", () => {
    const phaseIds = [
      "phase-2-definition-and-simplification",
      "phase-2-simplification-correction",
      "phase-2-review-correction-and-ambiguity",
      "phase-2-candidate-gate-acceptance",
    ];
    const domainRoutes = routes(phaseIds);
    expect(routeContracts(phaseIds)).toEqual(phase2Contracts);
    expect(domainRoutes).toHaveLength(29);
    expectCompleteRoutes(domainRoutes, domainRoutes.map((route) => route.route));
    expect(domainRoutes.find((route) => route.route === "SYS")).toMatchObject({
      obligations: ["phase-2-review-correction-required@1"],
      participation: {
        mode: "autonomous",
        policies: ["phase-2-correction-participation@1"],
        authority: "package-evidence",
      },
      resolvers: ["revise-phase-2-subject-after-review@1"],
      next: ["assignment"],
    });
    expect(domainRoutes.find((route) => route.route === "reviewed rejection")).toMatchObject({
      participation: {
        mode: "autonomous",
        policies: ["phase-2-correction-participation@1"],
        authority: "package-evidence",
      },
      resolvers: ["revise-phase-2-candidate-after-review@1"],
      next: ["assignment"],
    });
    expect(domainRoutes.find((route) => route.route === "exact acceptance")).toMatchObject({
      obligations: ["system-acceptance-required@1"],
      resolvers: ["accept-phase-2-system@1"],
      next: ["assignment"],
    });
    expect(domainRoutes.find((route) => route.route === "progression")?.next).toEqual([
      "assignment",
    ]);
  });

  it("proves PAS correction and reviewed terminal outcomes from exact lifecycle evidence", () => {
    const assessment = record("PAS", "PAS-HARDEN0001", {
      title: "Pilot assessment",
      rationale: "Measure exact pilot evidence.",
      process_ref: processRef,
      result: "proceed",
      findings: [],
      recommendation: "proceed",
    }, [], "assess-phase-0-2-pilot@1");
    const failedReview = (subject: ReturnType<typeof record>, id: string) => record("REV", id, {
      title: `Failed ${subject.datum.revision_id}`,
      review_kind: "contextual",
      rubric_ref: "policies/rubrics/bootstrap-review.md@1",
      findings: [{ id: "F-001", target: subject.datum.revision_id, relationship: "primary", severity: "blocking", summary: "Correct the assessment." }],
      outcome: "fail",
    }, [{ type: "reviews", target: subject.datum.revision_id }], "review-datum-in-context@2");
    const firstFailure = failedReview(assessment, "REV-HARDEN0001");
    const second = record("PAS", assessment.datum.id, { ...assessment.datum.payload }, [
      { type: "corrects-review", target: firstFailure.datum.revision_id },
    ], "revise-pilot-assessment-after-review@2", 2);
    const secondFailure = failedReview(second, "REV-HARDEN0002");
    const third = record("PAS", assessment.datum.id, { ...assessment.datum.payload }, [
      { type: "corrects-review", target: secondFailure.datum.revision_id },
    ], "revise-pilot-assessment-after-review@2", 3);
    const thirdFailure = failedReview(third, "REV-HARDEN0003");
    const evaluation = evaluateLifecycle(processPackage, {
      processRef,
      phaseId: "phase-2-pilot-assessment",
      records: [assessment, firstFailure, second, secondFailure, third, thirdFailure],
      dependencyComparisons: [],
    });
    expect(evaluation.looseEnds.find((item) =>
      item.obligation === "pilot-assessment-review-correction-required" &&
      item.subject === third.datum.revision_id
    )).toEqual(expect.objectContaining({
      eventualResolver: "revise-pilot-assessment-after-review@2",
      unresolvedBindings: ["context"],
    }));
    const snapshot = {
      processRef,
      phaseId: "phase-2-pilot-assessment",
      records: [assessment, firstFailure, second, secondFailure, third, thirdFailure],
      dependencyComparisons: [],
    };
    expect(evaluateScenarioParticipation(
      processPackage,
      snapshot,
      "revise-pilot-assessment-after-review@2",
      [{ assessment: third.datum.revision_id }],
    )).toEqual([
      expect.objectContaining({
        authorityRequirement: expect.objectContaining({ mode: "attended", authority: "stakeholder" }),
        attentionSchedule: expect.objectContaining({ timing: "immediate" }),
      }),
    ]);
    const phaseIds = ["pilot-assessment", "expansion-decision-and-terminal-outcomes"];
    const domainRoutes = routes(phaseIds);
    expect(routeContracts(phaseIds)).toEqual(pilotContracts);
    expectCompleteRoutes(domainRoutes, domainRoutes.map((route) => route.route));
    expect(domainRoutes.find((route) => route.route === "proceed")?.next).toEqual(["profile-boundary-reached"]);
    expect(domainRoutes.find((route) => route.route === "change")?.next).toEqual(["assignment"]);
    expect(domainRoutes.find((route) => route.route === "stop")?.next).toEqual(["lifecycle-complete"]);
  });

  it("proves accepted change and shared-consumer closure routes with selective reuse", () => {
    const system = record("SYS", "SYS-HARDEN0001", requirement("Shared export"));
    const other = record("SYS", "SYS-HARDEN0002", requirement("Unrelated title"));
    const consumerPayload = { title: "Consumer", rationale: "Exact coverage.", stage: "completion", architecture_element: "AEL-HARDEN001", target_child_type: "SYS", behavioral_slice: "shared", expected_coverage: ["shared"], exclusions: [], dependencies: [], required_review_policy: "review-applicability@1", parent_coverage_status: "complete", deferred_questions: [], cross_group_dependencies: [], output_reviews_complete: true, simplification_disposition: "retained" };
    const consumerA = record("DWP", "DWP-HARDEN0001", consumerPayload, [{ type: "decomposes", target: system.datum.revision_id }]);
    const consumerB = record("DWP", "DWP-HARDEN0002", consumerPayload, [{ type: "decomposes", target: system.datum.revision_id }]);
    const affected = record("VER", "VER-HARDEN0001", { title: "Affected", rationale: "Exact evidence.", kind: "pilot", method: "test", assessment_mode: "automatic", claim: { kind: "pilot", scope: "verification-design", formal_evidence_eligible: false }, acceptance_criteria: ["observable"], evidence_requirements: ["exact"], expected_success_activity: "success", expected_discrimination_activity: "reject" }, [{ type: "verifies", target: system.datum.id }, { type: "verifies-revision", target: system.datum.revision_id }]);
    const unrelated = record("VER", "VER-HARDEN0002", { ...affected.datum.payload, title: "Unrelated" }, [{ type: "verifies", target: other.datum.id }, { type: "verifies-revision", target: other.datum.revision_id }]);
    const accepted = record("BSL", "BSL-HARDEN0001", { title: "Accepted", kind: "level-accepted", role: "accepted", scope: "SYSTEM", group: "DEFAULT", definition_members: [system.datum.revision_id, other.datum.revision_id, consumerA.datum.revision_id, consumerB.datum.revision_id], evidence: [affected.datum.revision_id, unrelated.datum.revision_id] });
    const change = record("CHG", "CHG-HARDEN0001", { title: "Change shared SYS", rationale: "Bound impact.", scope: "shared SYS", planned_changes: ["replace"], implementation_order: "requirements -> context -> reviews -> baselines -> verification", closure_criteria: ["both consumers fresh"] }, [{ type: "impacts", target: system.datum.revision_id }, { type: "impacts", target: accepted.datum.revision_id }], "analyze-change-impact@2");
    const replacement = record("SYS", system.datum.id, requirement("Shared export with rejection"), [{ type: "changed-under", target: change.datum.revision_id }], "revise-requirement-under-change@3", 2);
    const evaluation = evaluateLifecycle(processPackage, { processRef, phaseId: "phase-7-change-control", records: [system, replacement, other, consumerA, consumerB, affected, unrelated, accepted, change], dependencyComparisons: [] });
    expect(evaluation.looseEnds.filter((item) => item.obligation === "shared-system-consumer-reevaluation-required").map((item) => item.subject)).toEqual([
      consumerA.datum.revision_id,
      consumerB.datum.revision_id,
    ]);
    expect(evaluation.artifacts[affected.datum.revision_id]?.states.validity).toBe("stale");
    expect(evaluation.artifacts[unrelated.datum.revision_id]?.states.validity).toBe("valid");
    const phaseIds = ["accepted-stakeholder-change", "shared-system-change"];
    const domainRoutes = routes(phaseIds);
    expect(routeContracts(phaseIds)).toEqual(changeContracts);
    expectCompleteRoutes(domainRoutes, domainRoutes.map((route) => route.route));
    expect(domainRoutes.find((route) => route.route === "closure")?.resolvers).toEqual(["close-change-request@4"]);
    expect(domainRoutes.find((route) => route.route === "closure")?.next).toEqual(["profile-boundary-reached"]);
  });
});

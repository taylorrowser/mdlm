---
id: plan-verification
version: 23
skills: []
---

# Author independent verification

Give a fresh verification author `mdlm verification context <exact-RQS-or-EXP> --output <new-file> --json`. Supply that export, the public operation contact, and a source-free projection of the selected direct guidance containing only action, subject, package, prompt, payloadSchemas and candidates. Pass these fields unchanged with saved file paths and digests; they identify the selected action/version, exact subject, package identity/digest and candidate bindings. Keep the full guidance context with the lifecycle author.

The receiving author checks the saved bytes against those digests and confirms that the projected package matches the intent export's package. The verification author defines methods, cases, expected results and inspection criteria without product source, implementation explanations or product-authored expectations. Necessary source inspection follows the criteria freeze described below; source provides evidence, never the required behavior. Copy the intent export's subject into authoring_subject and its authoringContext digest into authoring_context. Ask for requirement clarification when two readings of the public contract give different stakeholder-visible results; otherwise choose a check that accepts both readings and record that choice in the coverage rationale.

Commit the verifier in a separate Git repository. Define each activity's method and objective, exact REQ or EXP targets, cases and coverage. Each case has preconditions, intended actions, expected results and a rationale. Keep coverage rationale about the method and its limits; label retained preparation notes as historical, and read current execution and review state from their exact records and verification status.

Create exactly one `coverage` entry for each exact target selected by the activity's `verifies` links. Combine that target's obligations in its `obligations` array. Its `case_ids` must list every declared case whose `targets` contains that exact target, once each, with no other case IDs. Do not split one target into several coverage entries by obligation or case. A single EXP therefore has one coverage entry even when its criterion has several obligations and cases.

Write shared method criteria or predecessor class reconciliation once in a named passage of the activity's objective. Each coverage rationale names the applicable passage and explains how its exact target obligations and listed cases use it, including target-specific sufficiency and remaining gaps. Keep each target's exact links, obligations and complete case_ids, frozen expectations, captured evidence and independent judgments. A common account explains shared evidence; each target still needs its own coverage argument.

Before publication, check the final cases and coverage against every selected
requirement and its incorporated normative ICD clauses, including required request
fields, domain boundaries and failure conditions. For every coverage claim, check
that its stated conditions and stimuli occur in the committed case and that its
combined assertions and declared inspections establish the claimed result. Name
clause IDs and remaining evidence gaps in the existing coverage rationale. An activity may claim part of a requirement;
the complete selected plan must establish the whole obligation. For each parent,
check whether the final cases and inspections establish its actual integrated
conditions, including relevant failures across components. Passing isolated cases
or fixtures does not establish an unexercised or unassessed interaction. Close
concrete gaps within this authoring turn using methods that fit the claim. Shared
cases and scripts remain valid. Derive expectations independently of product source
organization and private functions.

Choose the method per claim and state what its evidence establishes. Mechanically assert exact public numeric and protocol behavior, including required values, identities, associations, transitions and error results. Derive these expectations from the public contract. Compare public values using the contract's semantics. Preserve required structure, exact-field constraints and meaningful ordering; accept representation differences and extra fields the contract leaves open. Compare full before/after state where preservation is required. For CLI, web or API work, observe the public interaction and its result; analysis can compare those observations with an explicit model. Keep presentation choices flexible where the contract permits them.

Method and execution level are separate choices. A detailed software rule may use
an independent unit or component test through a declared stable contract. When
levels are used, target system and high-level requirements through their ICD
clauses and product entry points so the activity survives a rewrite; verify
behavioral low-level requirements by a component test through a stable seam, and a
realization constraint by declared inspection where behavior cannot establish it. A
language-specific adapter may invoke that contract and translate representations;
it must not compute the expected result, inspect private implementation state or
conceal a required difference. An internal ICD is useful for a meaningful shared
boundary; no ICD is required for each function. Obtain missing invocation details
through the public operation contact without exposing product source or tests.
Keep implementation-specific launch commands and UI locators in the invocation
adapter, separate from requirement-derived actions and expected results. Record
those adapter details and the exact product they operate. They may change for
another implementation while expectations remain fixed. When a requirement or
its incorporated ICD clause prescribes a launch command or locator, verify that
contract explicitly; an adapter cannot waive it. A finite observation timeout
for an eventual outcome is a measurement limit unless the contract sets a deadline.
Retain actual-product and integration evidence for parent claims spanning components.
Identify each activity's execution boundary and its limits in objective and coverage
rationale, rather than treating component passes as evidence for the whole product.

When a claim concerns meaning that mechanical checks cannot establish, use independent inspection of the captured output against explicit requirements-based expectations. Inspect the relevant associations and qualifications, not just word presence. State which claims need judgment and which remain mechanical. Preserve the observations, the inspector's judgments and their evidence references; uncertainty or an unperformed inspection cannot become a pass. Select this method only for claims that need it.

For example, "Saved successfully. Write rejected." does not communicate an
unambiguous rejection even when state is unchanged. A finite success-phrase
regex and its negation cannot establish rejected-save meaning. Judge the complete
message and its context with the inspection method above. Exact wording is an
assertion only when the contract requires it; unfamiliar wording otherwise needs
judgment against the frozen expectations, not a longer synonym list.

When a requirement constrains the implementation in a way public behavior cannot
establish, declare a complementary independent source inspection and its coverage
limits. For example, matching API scores does not establish that a browser never
calculates scores itself. After freezing requirement-derived criteria, the inspector
may examine the exact committed product source and relevant dependencies. Record
the inspected scope and artifact identities with the judgment; an incomplete scope
remains unverified. Keep the requirement and expected behavior independent of what
the source happens to do.

## Optional formal postrun inspection

For an activity targeting formal REQs selected by an IMP, you may opt into a two-stage method named "formal collection and independent postrun inspection". Before product source access or observation, freeze the complete semantic criteria and evidence sufficiency criteria in the existing objective, coverage obligations and rationale. Associate every criterion with its exact requirement and case. State separately which assertions complete during execution and which obligations the independent implementation REV must judge. The complete selected plan and its independent REV must establish every selected requirement, including integrated meaning and relevant failures. Keep reusable deterministic cases and assertions unchanged.

The executable stage exercises the frozen stimuli, preserves complete observations and checks its declared collection assertions. A case may report pass only for those assertions, with actual_results stating that semantic judgment remains for implementation review. Its expected_results and coverage rationale must make that limited claim explicit. Capture complete messages, exact inputs, stimulus associations and required before/after state, with sufficient context for every frozen criterion. When a claim needs a complete session capture, establish stream and process closure, retain exit and forced-termination evidence, and report an observation limit or incomplete capture as `error` or `skipped` rather than collection pass. A missing collection artifact or failed assertion retains its truthful fail, error or skipped outcome. Collection PASS is not complete verification or a semantic PASS.

The adequacy review judges this combined method before relying on it. After native execution and truthful RES publication, export the full existing implementation-review context, including exact verifier source, receipt, streams and captured artifacts. A fresh independent implementation reviewer judges every frozen semantic criterion against those bytes and records conclusions and evidence references in findings and the relevant coverage_assessments rationale. Formal verification and acceptance remain blocked until that review supports every obligation. Supply missing already-retained context before registration and preserve intermediate assessments; a genuine evidence gap remains incomplete. A registered failure or raw fail/error/skipped result cannot be overridden by inspection.

This option applies only to formal IMP verification. TRY and EXP activities retain completed semantic judgments in their executable method before reporting pass, so observed-pass continues to mean an assessed observation. Demonstration claims still require their declared recording and replay. The preparation and stale-judgment rules below apply to methods that carry inspection judgments into executable cases; the formal postrun option instead completes its declared inspection in implementation REV.

For independent inspection, alone or alongside automated checks, freeze the
intended actions, expected results and inspection criteria before observing the
product. Where public operation is available, complete the planned observation
and judgment while preparing the verifier, before its first VFY publication when
practical. Observations may inform invocation adapters and replay mechanics, never
the required expected behavior. Preserve exact intent, product, input and observation
bindings with the judgment. A judgment may fail; completion does not mean passing.
An unavailable or unperformed inspection remains explicitly incomplete. Early
publication of an incomplete activity remains available when useful. Preparation
evidence does not replace canonical execution of the selected activity against the
exact product. Changed inspected artifacts or observations need fresh inspection;
a difference alone does not establish a requirement failure.

Keep source-specific judgments separate from reusable behavioral assertions.
For unassessed observations or a judgment whose bound source or observations have
changed, report the affected case as `skipped` or `error` with the missing judgment
in actual_results, then obtain fresh inspection. A prior hash mismatch identifies
stale evidence, not a behavioral failure. Reserve `fail` for an assessed requirement
violation; retain requirement-derived cases when updating invocation details or
inspection evidence.

Before relying on the method, try relevant controls: an alternative valid output should remain acceptable, and an output with the wrong value, association or meaning should fail. Choose controls for the actual claim and allowed variation. Apply these controls through the complete relevant case path, including waits, branches and assertions. Check that alternatives expressly allowed by the frozen case remain reachable and acceptable, and that a close contradictory result fails even when it shares the expected words or values. They check the verifier's adequacy, not product compliance. Correct an unsuitable predicate or choose a different method when it rejects valid behavior or accepts a contradiction. Bind each promised control claim to an executed stimulus and captured judgment through the applicable case path. An unchanged refusal diagnostic does not exercise contradictory refusal meaning. Shared representative witnesses may establish several claims when their applicability is explained; a Cartesian product of controls and inputs is not required.

For demonstration, specify intended actions/results first, preserve the actual computer-use run, then write and rerun a reproducible script from those interactions. Preserve the original expected results and observed failures when demonstration reveals a product defect. A replay is separate evidence; the recording alone does not establish reproducibility. If replay uses an inspection judgment, bind it to the exact case, intent, inputs and captured observations it assessed. Changed observations require fresh inspection; changed intent or inputs require reassessing applicability. Reuse cannot transfer a historical pass to uninspected behavior.

Set repository_path, exact source_commit, verification_script and verification_command for the verifier. Pin verification_image by registry digest or immutable local sha256 image ID. Set results_path to the relative JSON report in the evidence directory. The runner mounts committed product at /product and verifier at /verification, and exposes MDLM_PRODUCT_DIR and MDLM_EVIDENCE_DIR. The declared report uses contract mdlm-verification-results@1 and cases containing case_id, outcome pass/fail/error/skipped, actual_results as strings, and evidence_refs as relative captured file paths. Emit every declared case once. Keep meaningful artifacts such as browser traces beside the report. A missing, duplicate or unknown case is an execution error, never a pass.

Read "Native verification runtime" in the installation's `docs/contracts/direct-work.md` before authoring the script. If the complete suite exceeds its fixed execution budget, publish multiple VFY candidates using the same committed verifier with per-activity case selectors. Preserve the frozen cases and expectations; declare each activity's exact partial coverage and required ICD links. The complete selected plan must still establish every selected obligation. After writing the report, exit `0` when every case passes, `1` when any case fails and none is errored or skipped, or `2` when any case is errored or skipped. Report/exit disagreement is an execution error.

Use the declared product or component contract to guide interactions and requirements to derive expected outcomes. Separate directories preserve source identities but do not prevent reading product source; independent authoring and review enforce this boundary. Keep the method honest when a requirement needs evidence that the selected execution cannot establish.

Publish with the supplied direct guidance. Add exact verifies links matching all case targets. The activity's uses-interface links must equal the union of its targets' own uses-interface links, listed in each target's `links` in the verification context export: include every ICD a target uses and none that no target uses. Revise an activity when its expectations, coverage, verifier or targets change; after a failed adequacy review, `correct-verification-after-review` is the required correction of that exact activity. When revising or reusing a method, reconcile the predecessor objective, coverage, inspection and evidence-sufficiency criteria alongside its cases. For each unchanged obligation, retain its completion criteria and assigned inspector or explain the replacement method and its sufficiency in the existing coverage rationale. Before removing, merging or narrowing a case, list the targets it covered that remain selected and the condition and assertion it gave each. Keep that evidence for every target whose obligation is unchanged, in the same case or another, with a different stimulus where the old one no longer exists. A case named for a removed feature may still be the only evidence for a surviving requirement. A faulty verifier is a verification correction, not automatically a product defect. Prior evidence remains historical. Reuse a plan on a new product through exact verification links and fresh execution; a pass on an older commit does not verify the new one.

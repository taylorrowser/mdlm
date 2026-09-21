---
id: plan-verification
version: 11
skills: []
---

# Author independent verification

Give a fresh verification author `mdlm verification context <exact-RQS-or-EXP> --output <new-file> --json`. Supply that export, the public operation contact, and a source-free projection of the selected direct guidance containing only action, subject, package, prompt, payloadSchemas and candidates. Pass these fields unchanged with saved file paths and digests; they identify the selected action/version, exact subject, package identity/digest and candidate bindings. Keep the full guidance context with the lifecycle author.

The receiving author checks the saved bytes against those digests and confirms that the projected package matches the intent export's package. The verification author defines methods, cases, expected results and inspection criteria without product source, implementation explanations or product-authored expectations. Necessary source inspection follows the criteria freeze described below; source provides evidence, never the required behavior. Copy the intent export's subject into authoring_subject and its authoringContext digest into authoring_context. Ask for requirement clarification when the public contract does not define an observable result.

Commit the verifier in a separate Git repository. Define each activity's method and objective, exact REQ or EXP targets, cases and coverage. Each case has preconditions, intended actions, expected results and a rationale.

Create exactly one `coverage` entry for each exact target selected by the activity's `verifies` links. Combine that target's obligations in its `obligations` array. Its `case_ids` must list every declared case whose `targets` contains that exact target, once each, with no other case IDs. Do not split one target into several coverage entries by obligation or case. A single EXP therefore has one coverage entry even when its criterion has several obligations and cases.

Before publication, check the final cases and coverage against every selected
requirement and its incorporated normative ICD clauses, including required request
fields, domain boundaries and failure conditions. Name clause IDs and evidence gaps
in the existing coverage rationale. An activity may claim part of a requirement;
the complete selected plan must establish the whole obligation. For each parent,
check whether the final cases and inspections establish its actual integrated
conditions, including relevant failures across components. Passing isolated cases
or fixtures does not establish an unexercised or unassessed interaction. Close
concrete gaps within this authoring turn using methods that fit the claim. Shared
cases and scripts remain valid. Derive expectations independently of product source
organization and private functions.

Choose the method per claim and state what its evidence establishes. Mechanically assert exact public numeric and protocol behavior, including required values, identities, associations, transitions and error results. Derive these expectations from the public contract. Compare every required field and constraint; extra unrequired response fields are not a behavioral failure. Compare full before/after state where preservation is required. For CLI, web or API work, observe the public interaction and its result; analysis can compare those observations with an explicit model. Keep presentation choices flexible where the contract permits them.

Method and execution level are separate choices. A detailed software rule may use
an independent unit or component test through a declared stable contract. A
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

Before relying on the method, try relevant controls: an alternative valid output should remain acceptable, and an output with the wrong value, association or meaning should fail. Choose controls for the actual claim and allowed variation. Apply these controls through the complete relevant case path, including waits, branches and assertions. Check that alternatives expressly allowed by the frozen case remain reachable and acceptable, and that a close contradictory result fails even when it shares the expected words or values. They check the verifier's adequacy, not product compliance. Correct an unsuitable predicate or choose a different method when it rejects valid behavior or accepts a contradiction.

For demonstration, specify intended actions/results first, preserve the actual computer-use run, then write and rerun a reproducible script from those interactions. Preserve the original expected results and observed failures when demonstration reveals a product defect. A replay is separate evidence; the recording alone does not establish reproducibility. If replay uses an inspection judgment, bind it to the exact case, intent, inputs and captured observations it assessed. Changed observations require fresh inspection; changed intent or inputs require reassessing applicability. Reuse cannot transfer a historical pass to uninspected behavior.

Set repository_path, exact source_commit, verification_script and verification_command for the verifier. Pin verification_image by registry digest or immutable local sha256 image ID. Set results_path to the relative JSON report in the evidence directory. The runner mounts committed product at /product and verifier at /verification, and exposes MDLM_PRODUCT_DIR and MDLM_EVIDENCE_DIR. The declared report uses contract mdlm-verification-results@1 and cases containing case_id, outcome pass/fail/error/skipped, actual_results as strings, and evidence_refs as relative captured file paths. Emit every declared case once. Keep meaningful artifacts such as browser traces beside the report. A missing, duplicate or unknown case is an execution error, never a pass.

Read "Native verification runtime" in the installation's `docs/contracts/direct-work.md` before authoring the script. After writing the report, exit `0` when every case passes, `1` when any case fails and none is errored or skipped, or `2` when any case is errored or skipped. Report/exit disagreement is an execution error.

Use the declared product or component contract to guide interactions and requirements to derive expected outcomes. Separate directories preserve source identities but do not prevent reading product source; independent authoring and review enforce this boundary. Keep the method honest when a requirement needs evidence that the selected execution cannot establish.

Publish with the supplied direct guidance. Add exact verifies links matching all case targets and uses-interface links for necessary public ICDs. Revise an activity when its expectations, coverage or verifier change. A faulty verifier is a verification correction, not automatically a product defect. Prior evidence remains historical. Reuse a plan on a new product through exact verification links and fresh execution; a pass on an older commit does not verify the new one.

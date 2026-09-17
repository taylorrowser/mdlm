---
id: plan-verification
version: 3
skills: []
---

# Author independent verification

Give a fresh verification author `mdlm verification context <exact-RQS-or-EXP> --output <new-file> --json`. Supply that export, the public operation contact, and a source-free projection of the selected direct guidance containing only action, subject, package, prompt, payloadSchemas and candidates. Pass these fields unchanged with saved file paths and digests; they identify the selected action/version, exact subject, package identity/digest and candidate bindings. Keep the full guidance context with the lifecycle author.

The receiving author checks the saved bytes against those digests and confirms that the projected package matches the intent export's package. The verification author must work without product source, implementation explanations or product-authored expectations. Copy the intent export's subject into authoring_subject and its authoringContext digest into authoring_context. Ask for requirement clarification when the public contract does not define an observable result.

Commit the verifier in a separate Git repository. Define each activity's method and objective, exact REQ or EXP targets, cases and coverage. Each case has preconditions, intended actions, expected results and a rationale.

Create exactly one `coverage` entry for each exact target selected by the activity's `verifies` links. Combine that target's obligations in its `obligations` array. Its `case_ids` must list every declared case whose `targets` contains that exact target, once each, with no other case IDs. Do not split one target into several coverage entries by obligation or case. A single EXP therefore has one coverage entry even when its criterion has several obligations and cases.

Across the selected activities, address every obligation of each requirement, including relevant boundary and failure behavior. An activity may cover part of a requirement when its coverage claim states that part clearly; the complete selected plan must cover the whole requirement. Parent requirements need their own coverage argument; decomposition alone is not evidence. Many cases may share a script and one case may verify several requirements. Keep verification independent of product source organization and private functions.

Choose the method and tool that fit the claim. A CLI test can launch its public command, a web test can interact with a browser, and analysis can evaluate observable outputs against an explicit model. For demonstration, specify intended actions/results first, preserve the actual computer-use run, then write and rerun a reproducible script from those interactions. Preserve the original expected results even when demonstration reveals a product defect. A replay is separate evidence; the recording alone does not establish reproducibility.

Set repository_path, exact source_commit, verification_script and verification_command for the verifier. Pin verification_image by registry digest or immutable local sha256 image ID. Set results_path to the relative JSON report in the evidence directory. The runner mounts committed product at /product and verifier at /verification, and exposes MDLM_PRODUCT_DIR and MDLM_EVIDENCE_DIR. The declared report uses contract mdlm-verification-results@1 and cases containing case_id, outcome pass/fail/error/skipped, actual_results as strings, and evidence_refs as relative captured file paths. Emit every declared case once. Keep meaningful artifacts such as browser traces beside the report. A missing, duplicate or unknown case is an execution error, never a pass.

Read "Native verification runtime" in the installation's `docs/contracts/direct-work.md` before authoring the script. After writing the report, exit `0` when every case passes, `1` when any case fails and none is errored or skipped, or `2` when any case is errored or skipped. Report/exit disagreement is an execution error.

Only public interface information may guide interactions and expected outcomes. Separate directories preserve source identities but do not prevent reading product source; independent authoring and review enforce this boundary. Keep the method honest when a requirement needs evidence that the selected execution cannot establish.

Publish with the supplied direct guidance. Add exact verifies links matching all case targets and uses-interface links for necessary public ICDs. Revise an activity when its expectations, coverage or verifier change. A faulty verifier is a verification correction, not automatically a product defect. Prior evidence remains historical. Reuse a plan on a new product through exact verification links and fresh execution; a pass on an older commit does not verify the new one.

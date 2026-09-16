---
id: plan-verification
version: 1
skills: []
---

# Author independent verification

Give a fresh verification author `mdlm verification context <exact-RQS-or-EXP> --output <new-file> --json`. Supply that export and the public operation contact only. The author must work without product source, implementation explanations or product-authored expectations. Record its returned authoring_subject and authoring_context values. Ask for requirement clarification when the public contract does not define an observable result.

Commit the verifier in a separate Git repository. Define each activity's method and objective, exact REQ or EXP targets, cases and coverage. Each case has preconditions, intended actions, expected results and a rationale. Coverage lists the obligations of each target and the case IDs that establish them. Include every obligation of each covered requirement, including relevant boundary and failure behavior. Parent requirements need their own coverage argument; decomposition alone is not evidence. Many cases may share a script and one case may verify several requirements. Keep verification independent of product source organization and private functions.

Choose the method and tool that fit the claim. A CLI test can launch its public command, a web test can interact with a browser, and analysis can evaluate observable outputs against an explicit model. For demonstration, specify intended actions/results first, preserve the actual computer-use run, then write and rerun a reproducible script from those interactions. Preserve the original expected results even when demonstration reveals a product defect. A replay is separate evidence; the recording alone does not establish reproducibility.

Set repository_path, exact source_commit, verification_script and verification_command for the verifier. Pin verification_image by registry digest or immutable local sha256 image ID. Set results_path to the relative JSON report in the evidence directory. The runner mounts committed product at /product and verifier at /verification, and exposes MDLM_PRODUCT_DIR and MDLM_EVIDENCE_DIR. The declared report uses contract mdlm-verification-results@1 and cases containing case_id, outcome pass/fail/error/skipped, actual_results as strings, and evidence_refs as relative captured file paths. Emit every declared case once. Keep meaningful artifacts such as browser traces beside the report. A missing, duplicate or unknown case is an execution error, never a pass.

Only public interface information may guide interactions and expected outcomes. Separate directories preserve source identities but do not prevent reading product source; independent authoring and review enforce this boundary. Keep the method honest when a requirement needs evidence that the selected execution cannot establish.

Publish with the supplied direct guidance. Add exact verifies links matching all case targets and uses-interface links for necessary public ICDs. Revise an activity when its expectations, coverage or verifier change. A faulty verifier is a verification correction, not automatically a product defect. Prior evidence remains historical. Reuse a plan on a new product through exact verification links and fresh execution; a pass on an older commit does not verify the new one.

---
description: Choose direct MDLM work and continue to a stakeholder or lifecycle boundary
---
Operate the lifecycle through the public `mdlm` CLI. Choose useful work from the current state, keeping proposed functionality as small as the stakeholder's goal permits.

1. Inspect Git state and finish or reconcile earlier work before starting a new transaction. Keep temporary guidance and proposals in ignored work storage or outside the repository.
2. Run `mdlm expectations --json`. For available work, choose an action and exact subject. Priority is a suggestion. Retrieve its prompt, inputs, schemas and candidates with `mdlm expectations show <action> [<exact-subject>] --json`.
3. Follow the guidance. Edit and verify product source where needed. If guidance calls for execution, commit the product source and script, then run `mdlm execution run <exact-implementation-or-prototype> <operation-id> --json`. Read the actual receipt and output. Retain failed evidence and use it to explain the correction.
4. Write a proposal naming a unique operation, the exact action, package, snapshot, subject and inputs, and your candidates. Candidates supply localId, type, payload, links and body; a revision also names its exact predecessor. Use `$<localId>` to reference another candidate's revision or `$<localId>.id` for its stable identity. MDLM allocates durable identities and derives managed data. Include the exact receipt when required.
5. Complete any authority requirement below, then submit the exact proposal file through `mdlm proposal submit <proposal-file> --json`. Preserve those bytes and the operation ID.
6. Inspect the accepted records with `mdlm doctor --json`, review the lifecycle diff, and commit the complete transaction with ordinary Git. Refresh discovery before choosing further work.

For stakeholder decisions, present the exact guidance to the named stakeholder and record their explicit conclusion. Supply the authority name in proposal evidence and the matching `--authority <name>` flag only when that authority actually supplied the decision. A recorded engineering-demo delegation applies only to its named demo.

For independent review, export `mdlm review context <action> <exact-subject> --json` and give it to a fresh read-only reviewer. A separate review manager registers the exact proposal and verdict with `mdlm review register <proposal-file> <verdict-file> --json`. Submit the unchanged registered proposal. The author does not register its own independent judgment.

If submission fails or its response is lost, inspect `mdlm proposal settlement <operation-id> --json` before changing or resubmitting anything. Accepted settlement reuses the existing publication. Once nonpublication is confirmed, fix the diagnostics and use a new operation for changed proposal bytes.

For an interrupted execution, inspect `mdlm execution settlement <operation-id> --json`. A completed execution is reused. An authenticated not-started result permits a later fresh operation. Preserve a started or incomplete execution and stop while its result remains uncertain.

Continue through ordinary authoring, verification and correction. Stop at a reported lifecycle or exploratory boundary, when required stakeholder/reviewer authority is unavailable, or when an integrity error or uncertain publication prevents continuation. Report the exact boundary, accepted publications and unresolved work. Optional actions do not themselves require reopening a completed product; use them when the stakeholder requests further work.

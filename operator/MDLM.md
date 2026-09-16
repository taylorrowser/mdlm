# Run MDLM

Start from the stakeholder's intended outcome and the current lifecycle. In an initialized repository, read the selected package's overview when present:

```bash
mdlm_package_path=$(jq -r '.package.path' .lifecycle/process-selection.json)
if [ -f "$mdlm_package_path/README.md" ]; then
  cat "$mdlm_package_path/README.md"
fi
```

Run this lookup from the lifecycle repository root. The selection file identifies the installed package; keep its exact identity. If it has no README, use discovery and action guidance directly:

```bash
mdlm expectations --json
mdlm expectations show <action> [<exact-subject>] --json
```

Discovery and guidance are read-only. Priority is a suggestion. Follow the package prompt and supplied skills, and inspect its exact inputs, schemas and candidate examples.

Repeat this loop until the agreed outcome or a concrete blocked boundary:

1. Settle any uncertain earlier publication or execution before choosing more work. Otherwise inspect current expectations and compare them with stakeholder intent and actual product-use evidence.
2. Choose one useful eligible action and briefly state why. Ask the stakeholder when missing intent or a material scope decision prevents that choice. Keep the scope as small as the useful outcome permits. Where the package supports exploration, use a runnable slice to answer an unresolved product question; use observations to judge what deserves formal commitment. For an accepted product, inspect the package's comparison or approved-change route before adopting a change.
3. Retrieve that action's exact guidance and carry out the authorized work. At a required review or stakeholder decision, initiate the request with the exact context described below. If no stakeholder or review manager is configured, ask the host for that contact. Continue independent authorized work while waiting; resume dependent work only after the required response.
4. Preserve the returned result, inspect and commit accepted data as described below, then retrieve fresh expectations. Use settlement when the response is uncertain. Let the new state and evidence guide the next choice.

At a package boundary, compare the exact accepted scope with the agreed outcome. Optional work need not all be exhausted. Report the usable artifact and how to exercise it, the actual acceptance or exploratory boundary, and any remaining work or concrete blocker. If guidance is blocked, required authority is unavailable, or publication cannot be authenticated, preserve the exact state and report the missing information. A stopped or uncertain operation is not completion.

Author a proposal with a unique operation ID, the guidance's action, package, snapshot, exact subject and inputs, and your candidates. Each candidate supplies a localId, type, payload, links and body. A revision also names its exact predecessor. References to another candidate use `$<localId>` for its revision or `$<localId>.id` for its stable identity. MDLM generates revision identities and managed data.

Save the chosen action's guidance as `guidance.json`. This example builds the complete proposal envelope from those exact values:

```bash
jq '{
  operation: "draft-requirements-001",
  action: .action,
  package: .package,
  snapshot: .snapshot,
  inputs: .inputs,
  candidates: .candidates
} + (if has("subject") then {subject: .subject} else {} end)' guidance.json > proposal.json
```

Choose a fresh `operation` value for your proposal. Edit `candidates` to satisfy the returned payload schemas and package prompt, preserving fixed values, required links and predecessors. Candidate examples are starting points and may lack required authored fields. Add `evidence` when the action needs a receipt, registered review or stakeholder authority; the sections below describe those requirements. Keep the copied action, package, snapshot, subject and inputs unchanged.

```bash
mdlm proposal submit proposal.json --json
mdlm proposal settlement <operation-id> --json
```

Use a new operation for a new proposal. Preserve the exact submitted bytes. After an interrupted or lost submission response, inspect settlement before doing more work. Accepted settlement authenticates the existing publication. Inspect and commit accepted lifecycle data before retrieving fresh guidance.

When guidance calls for verification, commit the product source and verification script, then run:

```bash
mdlm execution run <exact-implementation-or-prototype> <operation-id> --json
mdlm execution settlement <operation-id> --json
```

Read the actual receipt and captured output. Guidance's `evidence` array lists available receipt locators; choose the exact receipt supporting the proposed result or observation. The proposal's `evidence` is an object with a `receipt` field:

```json
{"evidence": {"receipt": "<exact git-blob: locator from guidance.evidence>"}}
```

Replace the placeholder with the complete selected locator string. This is a top-level proposal field, separate from the candidate payload. Keep the original captured execution when correcting the evidence envelope. A failing execution is evidence to assess, not a reason to discard history. Recover an uncertain execution through settlement; never start another execution merely because its response was lost.

For stakeholder decisions, ask the named stakeholder using the exact guidance context. When the required authority name is `stakeholder`, include this top-level proposal field:

```json
{"evidence": {"authority": ["stakeholder"]}}
```

Submit with the matching explicit flag:

```bash
mdlm proposal submit proposal.json --authority stakeholder --json
```

Use the exact authority name from guidance for both the array and flag. Authority comes from the attended answer, never from agent inference. Recorded engineering-demo delegation applies only to its named demo.

For independent review, give a fresh reviewer the export from `mdlm review context <action> <exact-subject> --json`. The review manager registers the exact proposal and verdict through `mdlm review register <proposal-file> <verdict-file> --json`. The author must not register its own judgment. Submit the exact registered proposal bytes.

For a fresh useful-product-to-baseline experiment, initialize with `mdlm init /path/to/lifecycle --process iterative`, then read the installed package overview using the selection lookup above. Its accepted formal scope is a profile boundary; compare that exact scope with the agreed whole product before declaring the experiment complete.

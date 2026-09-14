# Run MDLM

Inspect the current lifecycle and choose useful work:

```bash
mdlm expectations --json
mdlm expectations show <action> [<exact-subject>] --json
```

Discovery and guidance are read-only. Priority is a suggestion. Choose work that reduces uncertainty or advances the stakeholder's goal, keeping functionality as small as that goal permits. Follow the package prompt and inspect its exact inputs, schemas and candidate examples.

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

Continue through useful work and ordinary correction. At a reported boundary, explain whether it is exploratory completion or actual product acceptance. If guidance is blocked, an authority is unavailable, or publication cannot be authenticated, preserve the exact state and report the missing information.

For a fresh useful-product-to-baseline experiment, initialize with `mdlm init /path/to/lifecycle --process iterative` and follow the [iterative package](../.lifecycle/iterative/README.md). Its accepted formal scope is a profile boundary; compare that exact scope with the agreed whole product before declaring the experiment complete.

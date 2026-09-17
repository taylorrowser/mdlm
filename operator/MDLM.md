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

Each entry in `links` has `type` and `target` strings, for example `{"type":"verifies","target":"<exact-REQ-or-EXP-revision>"}` in a verification candidate. Use the exact revisions or candidate local references required by the selected link, and preserve supplied fixed links.

Prepare an editable draft for the action you chose. Use a fresh operation ID and a new file path. For example, after selecting `draft-requirements` on a new tiny product:

```sh
mdlm expectations show draft-requirements --json
mdlm proposal draft draft-requirements --operation requirements-001 --output proposal.json --json
# Edit proposal.json using the prompt and payloadSchemas returned above.
mdlm proposal submit proposal.json --json
mdlm proposal settlement requirements-001 --json
```

For work on an exact subject, put its revision after the action in both `expectations show` and `proposal draft`. Drafting resolves the current action version and copies the package, snapshot, exact subject, inputs, candidate fixed values, required links and predecessors. It returns the saved file's absolute path, byte count and SHA256. Existing files are preserved and cause an error. Relative output paths resolve from the current directory, as proposal submission paths do.

Complete the candidate payloads and body using the returned schemas and package prompt. Candidate examples may lack required authored fields. Preserve fixed values and bindings. Add `evidence` when the action needs a receipt, registered review or stakeholder authority; the sections below describe those requirements. Drafting does not choose evidence, grant authority, validate the finished claims or publish lifecycle data. A draft can become stale while being edited; submission still checks the exact snapshot and package.

Use a new operation for a new proposal. Preserve the exact submitted bytes. After an interrupted or lost submission response, inspect settlement before doing more work. Accepted settlement authenticates the existing publication. Inspect and commit accepted lifecycle data before retrieving fresh guidance.

Before authoring a verification script or choosing its tools and evidence, read
"Native verification runtime" in `docs/contracts/direct-work.md` in the MDLM
installation containing your CLI, alongside that installation's `README.md`.
It describes the fixed runtime and capture limits and the fields authors can set.

When the selected package supports independent verification, export the requirement or criterion context for a fresh verification author:

```bash
mdlm verification context <exact-RQS-or-EXP> --output verification-context.json --json
mdlm verification status <exact-product> --json
```

Follow that package's plan and review guidance. Keep verifier authoring separate from implementation source and explanations. Select exact activities on the product, then execute each with `mdlm execution run <exact-product> <operation-id> --activity <exact-VFY> --json`. Read case results and evidence before publishing the assessment. Shared scripts are supported; complete requirement coverage still needs an explicit adequacy judgment.

For a package using product-owned verification, commit the product source and verification script, then run:

```bash
mdlm execution run <exact-implementation-or-prototype> <operation-id> --json
mdlm execution settlement <operation-id> --json
```

Use `mdlm execution export <operation-id> <new-directory> --json` to inspect saved receipt evidence as files. This read-only export never repeats the command and preserves an existing destination. Read the actual receipt and captured output. Guidance's `evidence` array lists available receipt locators; choose the exact receipt supporting the proposed result or observation. The proposal's `evidence` is an object with a `receipt` field:

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

For independent review, save the full context and generate its handoff:

```bash
mdlm review context <action> <exact-subject> --output review-context.json --json
```

Pass the returned handoff to the review manager. It contains the saved file's absolute path, byte count and SHA256, with the exact action, subject, snapshot and package. The fresh reviewer reads that file. Choose a new path for each export; existing files are preserved and cause an error. Omitting `--output` returns the full context on stdout. The export SHA256 identifies the saved bytes; registration's canonical context digest is a separate value.

Verifier files may include binary evidence with `encoding: "base64"`. Inspect the
saved export by selected fields rather than printing the full binary content.
For example, list the files with
`jq '.verifierSources[] | {activity, sourceCommit, files: [.files[] | {path, blob, encoding}]}' review-context.json`.
Text files have no encoding field and keep readable `content`. To view binary
evidence, select its exact activity and path, decode its content as base64 to a
separate file, and open that file. Preserve the original export for registration.

The review manager registers the exact proposal and verdict through `mdlm review register <proposal-file> <verdict-file> --json`. The author must not register its own judgment. Submit the exact registered proposal bytes.

For a fresh useful-product-to-baseline experiment, initialize with `mdlm init /path/to/lifecycle --process iterative`, then read the installed package overview using the selection lookup above. Its accepted formal scope is a profile boundary; compare that exact scope with the agreed whole product before declaring the experiment complete.

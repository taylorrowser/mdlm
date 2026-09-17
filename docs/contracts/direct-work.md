# Direct lifecycle work contract

`src/direct-contract.ts` owns the shared types. This cutover is fresh-only.

Packages declare `actions/<id>.yaml` with kind `action-definition`, integer version, semantic capability, allowed `types`, and `prompt_ref`. Optional subject/input expressions provide context; `when` is an eligibility expression evaluated before inputs, with the exact subject bound. Authority names are explicit per action. Optional actions, such as requesting a post-acceptance change, do not prevent completion. `priority` is display order, never a claim on work.

CLI:
- `mdlm expectations --json`
- `mdlm expectations show <action> [<exact-subject>] --json`
- `mdlm proposal draft <action> [<exact-subject>] --operation <operation> --output <new-file> --json`
- `mdlm proposal submit <file|-> [--authority <name>] --json`
- `mdlm proposal settlement <operation> --json`
- `mdlm execution run <exact-implementation> <operation> --json`
- `mdlm execution settlement <operation> --json`
- `mdlm review context <action> <exact-subject> --json`
- `mdlm review register <proposal-file> <verdict-file> --json`

A proposal names the caller's operation identity, package action, exact package and snapshot, optional subject/input revisions, candidates and evidence. Candidate local references use `$<localId>` for an exact revision and `$<localId>.id` for its stable ID. A revision candidate supplies `predecessor` as an exact prior revision. The kernel allocates identities, resolves references and publishes the entire batch atomically. Candidate `created_by`, revision IDs and managed fields are never authored.

Core owns read-only missing-data discovery and eligibility. Domain module exports `finalizeDirectDomain(context)` for generated fields/data and associated semantic validation; finalization takes `DirectFinalizationContext` and returns `Promise<DirectFinalizationResult>`. Errors reject without publication. The domain module owns requirement, source and engineering constraints.

Authority module exports `buildDirectReviewContext(context: DirectContext)`, `registerDirectReview(root,context,proposalSource,verdictSource)`, and `validateDirectAuthority(context: DirectContext,proposal: DirectProposal,proposalSource: string): Promise<unknown>`. The last function returns durable evidence for the transaction or rejects. It must allow autonomous actions and require exact registered independent judgment or explicitly supplied stakeholder authority for protected actions. Complete source and verification receipt context must remain bound. Registry transport is not an OS authentication boundary.

Transaction provenance is `created_by.transaction = mdlm-direct-transaction@1`. The immutable record contains exact outputs and package/snapshot/operation/proposal digest bindings. Settlement authenticates all outputs, returns identical accepted work and rejects different content reusing the same operation. Guidance is read-only. No token, Assignment, lease or Scenario invocation authorizes publication.

Manifest declares `direct_contract: mdlm-direct@1` and `terminal: {when: <expression>, outcome: profile-boundary-reached | lifecycle-complete, reason: <text>}`. Result interfaces are in `direct-contract.ts`; guidance is returned directly with `ok:true` added, never wrapped in a packet. Rejected CLI operations return `{ok:false, diagnostics:[{code,message}]}` and nonzero exit.

Actions may declare `links` from output type and link name to an exact input name, `revises` from output type to predecessor input, and `fixed_payload` per type. These constraints apply to authored outputs before publication. Every current action publishes one authored datum except the requirements capability, which publishes its requirement/group/set batch; kernel-derived source scopes remain in the same transaction.

Stakeholder proposals carry `evidence.authority`, which must exactly match the explicitly supplied command flags. Adapters obtain those flags from attended transport, never from model-authored values. Accepted results and settlement return `proposalDigest` over the exact submitted UTF-8 JSON bytes. Review context is returned directly as `{ok:true,...context}`; execution guidance includes `executionSubject`, `executionCommand`, receipt locators and `receiptDetails` with captured output.

Guidance and review-context `payloadSchemas` describe authorable candidate fields;
computed fields remain present in the full records under review. For a changed
implementation review, both exports include `sourceAssessmentTargets`: its
`sourceScopes` are the exact affected baseline revisions requiring one
`source_assessments` row each. Current scopes and before/after comparisons remain
evidence for those judgments. Registration binds a verdict to its context;
publication still validates field permissions and exact assessment coverage.

## Explicit formal source selection

The opt-in requirement-trace@3 capability retains the v2 graph contract and permits IMP acceptance_scope partial with an exact nonempty formal_files list. Whole-product coverage remains the default and forbids a file selection. The complete committed source inventory and every file role remain visible. Partial inventory entries expose formal true or false; only formal files derive SCP data. The verifier must be formal. Unsupported binary entries, symlinks and submodules remain unsupported even when provisional.

Execution receipts bind formalFiles alongside the exact IMP, RQS, source commit, command and image. The executor removes unselected committed files before mounting the source snapshot. An exercised dependency on omitted source cannot pass. This does not prove unexercised branches or infer dependency completeness; independent review judges the declared claim against all visible source. Review context exposes acceptanceScope and a formal flag on every source file. Acceptance applies to the exact IMP and commit, never automatically to a later commit with similar files. A partial profile boundary is not whole-product completion.


## Independent verification

The fresh iterative package opts into `requirement-trace@4` and `independent-verification@1`. Historical packages retain their selected contracts. Product attribution remains required; `source_ranges` supports explicit language-neutral production ranges. Verification source lives in a separate committed repository and is selected by exact product `verification` links to VFY. It needs no product-owned verifier regions.

`mdlm verification context <exact-RQS-or-EXP> --output <new-file> --json` exports requirements, decomposition and necessary public ICDs for a fresh verifier author, excluding implementation source. The activity records its authoring subject/context, method, cases, expected results and target coverage. Independence is an authoring and review boundary; co-mounted source directories do not constitute an operating-system prohibition on reading source.

`mdlm execution run <exact-IMP-or-TRY> <operation> --activity <exact-VFY> --json` binds separate product and verifier commits, exact activity/cases and pinned environment. The report contract `mdlm-verification-results@1` contains cases with case_id, outcome, actual_results and evidence_refs. The complete activity is selected before execution. Missing, duplicate or unknown case output is an error. Case outcomes and artifact identities are kernel-managed RES fields. Exact executes, verifies and evaluates links bind product, requirement/criterion selection and activity. A new result supersedes prior current results only for that exact product/activity; old evidence is retained.

`mdlm verification status <exact-product> --json` reports coverage, adequacy review, current case outcomes and missing or stale evidence. Formal verified requires sufficient independently reviewed coverage and current passing results for every required case. The exact product review assesses the union of selected activity coverage for every requirement, so several individually adequate partial activities do not automatically establish complete coverage. EXP outcomes remain provisional observations. Acceptance checks the complete selected requirement graph. An old product or criterion pass does not automatically verify a successor source or promoted requirement.

`mdlm execution export <operation> <new-directory> --json` materializes the authenticated saved receipt, raw stdout/stderr, report and captured artifacts without rerunning execution or changing lifecycle data. The destination must be new; existing evidence is preserved.

## Native verification runtime

`mdlm execution run` executes committed source in a disposable Docker container.
Plan the verification method and captured evidence for these limits before
authoring the script. The method must still support the claim and its required
coverage.

| Runtime constraint | Public execution behavior |
| --- | --- |
| Network | Docker `--network none`; external networking is unavailable. |
| Filesystem and user | Read-only container root and source mounts; non-root user, all capabilities dropped and no new privileges. Independent verification uses the non-root caller's UID/GID, or `65534:65534` for a root caller. Product-owned verification uses `65534:65534`. |
| Processes | Fixed Docker PID limit of 128. |
| Temporary files | Writable `/tmp` tmpfs, limited to 64 MiB, with `nosuid,nodev`. |
| Execution time | The public command uses a 60-second wait for container completion. Timeout kills the container and records an error. Docker create and start each also have a 60-second timeout; this is not a 60-second limit for the whole CLI invocation. |
| Captured output | Combined stdout and stderr capture is limited to 16 MiB. Exceeding it records an incomplete-capture error. |

These settings are fixed through the public CLI. There is no activity field or
execution flag to override the timeout, PID limit, tmpfs size, networking or
capture budgets.

Independent verification mounts the committed product at `/product` and verifier
at `/verification`, both read-only, and starts in `/verification`. It supplies
`MDLM_PRODUCT_DIR=/product` and `MDLM_EVIDENCE_DIR=/evidence`. The writable
`/evidence` directory holds the report and its referenced artifacts. Product-owned
verification instead mounts its committed source read-only at `/workspace` and
starts there. Image tools and committed dependencies must be usable without
network downloads or writes to those source directories.

An independent activity selects `repository_path`, `source_commit`,
`verification_script`, `verification_command`, `verification_image` and
`results_path` through its authorable schema. The command is an argv array whose
first element becomes the container entrypoint. The image must be pinned as
`name@sha256:<digest>`; independent verification also accepts an exact local
`sha256:<image-id>`. Product-owned verification takes its source, script, command
and digest-pinned image from the product payload.

For independent verification, `results_path` identifies a JSON report relative to
`/evidence`; case `evidence_refs` are also relative to that directory. Their paths
must resolve through directories to regular files, without symlinks or `..`
components. The report bytes plus all distinct referenced artifact bytes share
one fixed 8 MiB budget, separate from stdout/stderr. This is a capture budget,
not a quota on the writable directory. Unreferenced files are not captured.
Missing or oversized referenced evidence makes the run an error, even when the
script exits successfully. Inspect the receipt diagnostic and export the saved
evidence before assessing the result.

After writing the complete independent verification report, make the verifier
script's exit status agree with its case outcomes:

| Report case outcomes | Verifier script exit | Run outcome |
| --- | --- | --- |
| Every case is `pass` | `0` | `pass` |
| At least one `fail`, with no `error` or `skipped` cases | `1` | `fail` |
| Any `error` or `skipped` case, including when other cases fail | `2` | `error` |

These are the verifier script's exit codes, not the product command's exit codes
or the MDLM CLI's exit status. Compute the exit from the reported outcomes after
writing the report; successfully writing a report containing failures does not
justify exit zero. A disagreement between report and script exit records an
execution error. An invalid report or incomplete evidence capture also records
an error regardless of the script's exit status.

## Editable proposal drafts

`proposal draft` uses the same current guidance and action resolution as `expectations show`. The caller selects the action, optional exact subject, operation identity and new output file. The saved JSON contains only the complete proposal envelope and unchanged candidate examples, including fixed payload values, exact links and predecessors. It supplies no semantic claims, receipt selection, review or stakeholder authority. Authored fields still need the prompt and `payloadSchemas` from guidance.

The `mdlm-proposal-draft@1` handoff reports `export.path`, `export.bytes`, `export.exportSha256`, operation, action, package, snapshot, optional subject and inputs, plus authoring instructions and the guidance command arguments. The digest describes the initial saved bytes; editing changes it. Relative paths follow existing CLI file resolution. Exclusive creation preserves existing files. Drafting leaves lifecycle data unchanged and does not reserve the snapshot or operation. Normal submit validation and settlement remain authoritative.

```sh
mdlm expectations show draft-requirements --json
mdlm proposal draft draft-requirements --operation requirements-001 --output proposal.json --json
# Fill authored candidate fields from the prompt and payloadSchemas.
mdlm proposal submit proposal.json --json
mdlm proposal settlement requirements-001 --json
```

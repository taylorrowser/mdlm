# Direct lifecycle work contract

`src/direct-contract.ts` owns the shared types. This cutover is fresh-only.

Packages declare `actions/<id>.yaml` with kind `action-definition`, integer version, semantic capability, allowed `types`, and `prompt_ref`. Optional subject/input expressions provide context; `when` is an eligibility expression evaluated before inputs, with the exact subject bound. Authority names are explicit per action. Optional actions, such as requesting a post-acceptance change, do not prevent completion. `priority` is display order, never a claim on work.

CLI:
- `mdlm expectations --json`
- `mdlm expectations show <action> [<exact-subject>] --json`
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

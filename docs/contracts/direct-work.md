# Direct lifecycle work contract

`src/direct-contract.ts` owns the shared types. This cutover is fresh-only.

Packages declare `actions/<id>.yaml` with kind `action-definition`, integer version, semantic capability, allowed `types`, and `prompt_ref`. Optional subject/input selectors provide context; `when` is an eligibility expression. Authority names are explicit per action. Optional actions, such as requesting a post-acceptance change, do not prevent completion. `priority` is display order, never a claim on work.

CLI:
- `mdlm expectations --json`
- `mdlm expectations show <action> [<exact-subject>] --json`
- `mdlm proposal submit <file|-> --json`
- `mdlm proposal settlement <operation> --json`
- `mdlm execution run <exact-implementation> <operation> --json`
- `mdlm execution settlement <operation> --json`
- `mdlm review context <action> <exact-subject> --json`
- `mdlm review register <proposal-file> <verdict-file> --json`

A proposal names the caller's operation identity, package action, exact package and snapshot, optional subject/input revisions, candidates and evidence. Candidate local references use `$<localId>` for an exact revision and `$<localId>.id` for its stable ID. A revision candidate supplies `predecessor` as an exact prior revision. The kernel allocates identities, resolves references and publishes the entire batch atomically. Candidate `created_by`, revision IDs and managed fields are never authored.

Core owns read-only missing-data discovery and eligibility. Domain module exports `finalizeDirectDomain(context)` for generated fields/data and associated semantic validation; finalization takes `DirectFinalizationContext` and returns `Promise<DirectFinalizationResult>`. Errors reject without publication. Domain worker owns actual requirements, source and engineering constraints.

Authority module exports `buildDirectReviewContext(context: DirectContext)`, `registerDirectReview(root,context,proposalSource,verdictSource)`, and `validateDirectAuthority(context: DirectContext,proposal: DirectProposal,proposalSource: string): Promise<unknown>`. The last function returns durable evidence for the transaction or rejects. It must allow autonomous actions and require exact registered independent judgment or explicitly supplied stakeholder authority for protected actions. Complete source and verification receipt context must remain bound. Registry transport is not an OS authentication boundary.

Transaction provenance is `created_by.transaction = mdlm-direct-transaction@1`. The immutable record contains exact outputs and package/snapshot/operation/proposal digest bindings. Settlement authenticates all outputs, returns identical accepted work and rejects different content reusing the same operation. Guidance is read-only. No token, Assignment, lease or Scenario invocation authorizes publication.

Manifest declares `direct_contract: mdlm-direct@1` and `terminal: {when: <expression>, outcome: profile-boundary-reached | lifecycle-complete, reason: <text>}`. Result interfaces are in `direct-contract.ts`; guidance is returned directly with `ok:true` added, never wrapped in a packet. Rejected CLI operations return `{ok:false, diagnostics:[{code,message}]}` and nonzero exit.

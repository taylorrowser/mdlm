# Tiny product Process Package

`mdlm-tiny@0.6.0` is the default Example Process Package. It targets small,
terminating Python command-line products with UTF-8 input and output. Requirements
form an ordinary linked graph, authored and reviewed in one batch. Earlier
package identities and accepted products retain their original history.

The normal journey still has six Assignments:

1. Write one REQ per stakeholder or software statement in a batch. The CLI
   generates an RQS with contains links to the complete selected graph.
2. Independently review that graph in one REV against the RQS.
3. Implement the product and verification script. IMP binds the exact reviewed
   RQS; submission generates source-scope SCPs from the committed snapshot.
4. Run the committed script through the CLI in Docker and assess its captured
   result in one RES.
5. Independently review implementation, source attribution and execution evidence
   in one REV.
6. Record the stakeholder's explicit accept or reject decision in one ACC linked
   to the exact product, requirements and passing evidence. Rejection preserves
   the decision and dispatches a same-lineage product correction under the
   unchanged requirements, followed by fresh verification, review and decision.

No per-requirement, per-scope or separately authored grouping turns are required.
REQ uses kind: stakeholder with a statement, or kind: software with structured
EARS. DCP parent and child links define each complete immediate-child group; RQS selects exact groups through decomposition links. REQs do not carry decomposition edges. Multiple
parents and useful software levels are allowed; software leaves in the complete
selected graph are the low-level code contracts. Structural checks reject broken
or incomplete selections, cycles and missing stakeholder ancestry. Review judges
whether children fulfill parents and whether leaf detail explains the code.

## Committed source and attribution

Keep product source in a separate Git checkout. IMP records repository_path,
source_commit, product command argv, file_roles, digest-pinned verification_image,
verification_command argv and relative verification_script. Declare every tracked
entry's role. The CLI derives product_files and source_inventory, including empty
files, from that commit. Documentation needs an inventory role; executable code,
verification and build scripts need complete nonblank-line attribution. This
initial route supports Python annotations. Unsupported code formats, configuration
that changes executable behavior, generated and vendored code require supported
explicit treatment before an all-code claim.

Annotations name selected published stable REQ IDs inside explicit closed,
nonnested named regions. Every nonblank source line, including imports and
comments, must be in a region. Whitespace-only gaps are exempt and recorded in
the generated inventory. File defaults are rejected. Regions may link several
requirements; requirements may link several regions. The CLI computes all ranges
and resolves IDs against the Assignment's exact graph. It atomically creates
SCPs with belongs-to IMP and implements/verifies REQ links. See the automatically
supplied `skills/source-trace.md@1` for syntax and review expectations.

Every production or verifier scope requires a software leaf with ancestry to a
stakeholder requirement. Verifier scopes may additionally verify upper-level
requirements. Their links describe contribution to verification, including setup
and assertion helpers. A complete attribution map is not semantic proof; review
checks that each scope's links explain its code and that file roles are honest.

## Verification and correction

The committed script owns executable expectations. Exit 0 means pass, exit 1
means assertion failure, and other exits mean execution error. Handle unexpected
exceptions separately. `skills/verification-starter.md@1` supplies an optional
raw-byte example to adapt and annotate for the selected requirements.

`mdlm assignment run --json` executes the exact snapshot in a pinned Docker image.
Source is read-only at /workspace, /tmp is writable and network is disabled. Use
a prebuilt runtime image; this route does not build custom images. The CLI stores
raw stdout/stderr and exit status in an immutable receipt and supplies RES.outcome
and RES.receipt. Authors supply an assessment and correction_target. Repeating the
run command reuses its completed receipt. After an environment repair, the public
--retry option records a new attempt while preserving the failed one.

All publications freeze immediately. A failed set Review creates a batch
correction in the same RQS lineage. Revise changed REQs and membership groups in the CLI-supplied frontier, preserving unchanged revisions. Each review separately assesses individual children and collective decomposition adequacy. Wrong requirements receive a fresh set
Review, then the IMP lineage binds the reviewed graph. Wrong product code or
verification revises IMP. Submission recomputes source scopes from the complete
snapshot rather than retaining or unioning old links. Both routes require fresh
execution, independent Review and stakeholder acceptance.

## Approved requirement changes

After accepted ACC establishes a baseline, `mdlm change request --requirements <exact-RQS> --json` starts a bounded CHG proposal. The CLI binds its accepted baseline. The next Assignment obtains stakeholder approval, then revises its requested roots. Baseline-controlled publications without approved scoped authority are rejected.

The CLI regenerates groups whose endpoints changed and queues exact assessments. Changed children trigger their own group review; unchanged children stop propagation and retain their exact deeper group reviews. Revising a shared child refreshes every direct parent group without revising those parents. A clarification may leave all children and code unchanged. Every group must remain collectively adequate even when each child remains valid.

Source and verification regions directly linked to changed requirements receive explicit dispositions and independent review. Updated products still need fresh Docker verification and stakeholder acceptance. Discovery outside approved scope creates an amendment and fresh stakeholder approval. One approved change is active per product lineage. Explicit RQS retires links remove requirements from candidate selection; all affected memberships must be resolved. Reinstatement and concurrent change merging are unsupported.

Generated traces support line-to-stakeholder and requirement-to-code inspection.
The change report identifies locations to inspect, not lines that necessarily
need edits. Record actual inspected/changed locations and compare them with the
prediction. Unstated semantic coupling remains a review concern.

Lifecycle Complete means the current graph has a passing independently reviewed
product accepted by the stakeholder. It never authorizes replay of a prior
Assignment. The lifecycle repository HEAD must remain unchanged while an
Assignment lease is open.

Use operational evidence to improve this package. When authoring or review
exposes avoidable friction, update its owning schema, prompt, skill or CLI in the
same session. Keep the learning durable; add process breadth only when a
concrete product need earns its cost.

Requirements and implementation reviews declare `review_contract.external_artifact:
registered-review@1`. The manager registers the externally returned exact verdict
through the CLI before the author submits it. See the root README section on
independent review registration. This fresh-only package does not migrate earlier
review publications.

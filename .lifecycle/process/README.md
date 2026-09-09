# Tiny product Process Package

`mdlm-tiny@0.3.0` is the default Example Process Package. It targets small,
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
6. Obtain stakeholder acceptance in one ACC linked to the exact product,
   requirements and passing evidence.

No per-requirement, per-scope or separately authored grouping turns are required.
REQ uses kind: stakeholder with a statement, or kind: software with structured
EARS. Software decomposes links point to exact parent REQ revisions. Multiple
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
verification and build scripts need complete physical-line attribution. This
initial route supports Python annotations. Unsupported code formats, configuration
that changes executable behavior, generated and vendored code require supported
explicit treatment before an all-code claim.

Annotations name selected published stable REQ IDs. A file default attributes
support code, imports, comments, blanks and lines outside closed nonnested named
regions. Regions override the default locally. The CLI resolves IDs only against
the Assignment's exact graph and computes all ranges. It atomically creates SCPs
with belongs-to IMP and implements/verifies REQ links. Authors maintain neither
line numbers nor a second trace map. See the automatically supplied
`skills/source-trace.md@1` for syntax and review expectations.

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
correction in the same RQS lineage. Revise or reaffirm affected REQs through
ordinary links, preserving old revisions. Wrong requirements receive a fresh set
Review, then the IMP lineage binds the reviewed graph. Wrong product code or
verification revises IMP. Submission recomputes source scopes from the complete
snapshot rather than retaining or unioning old links. Both routes require fresh
execution, independent Review and stakeholder acceptance.

## Approved requirement changes

The explicit revise-requirements scenario takes the exact accepted RQS and
publishes changed or reaffirmed REQs plus a new generated RQS in one batch. An
old child link to a superseded parent is not automatically valid for the new
parent. Inspect the predicted production and verifier locations before editing,
including unchanged affected code. Reaffirm selected links explicitly and follow
the normal set Review, product rebinding, verification and acceptance route.

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

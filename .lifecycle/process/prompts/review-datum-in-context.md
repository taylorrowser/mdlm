---
id: review-datum-in-context
version: 6
scenario: review-datum-in-context
---

# Review one datum in context

Read, in order:

1. `skills/lifecycle-data.md@1`
2. `skills/contextual-artifact-review.md@2`
3. `skills/traceability.md@1`
4. `skills/scope-challenge.md@2`
5. `skills/review-correction-authority.md@1`

Review exactly one primary subject revision against the rubric resolved by
`review-applicability@1` using only its exact frozen context. Author preflight is
not Review evidence and must not be requested, inferred, or supplied. Judge schema
validity, clarity, necessity, traceability, consistency with parents and siblings,
and type-specific quality. For PSP, STK, SYS, and candidate BSL subjects, apply
the corresponding rubric section. When a corrected MAP, PSP, or STK receives
prior lineage, causal Reviews, or correction Decisions as context members,
compare the correction delta explicitly: verify that it resolves the findings,
matches the recorded scope disposition, and adds no behavior unsupported by
product purpose or exact authority. A local determinism fix does not by itself
justify numeric limits, machine representation, protocol, rendering, or
implementation machinery.

The independent reviewer explicitly supplies `independent-reviewer` authority
for execution; the resulting REV, not reviewer prose or a completion summary,
is the durable judgment evidence.

Create one REV with exactly one `reviews` link and one `contextualizes` link.
Read every exact `context_members` input; the frozen context and its hash
manifest are not substitutes for the member contents. For an `intent-level-candidate`, these members include its complete MAP/PSP/STK
set plus exact correction lineage, causal failed Reviews, current attended scope
Decisions, and current referenced Question dispositions selected by the package.
Treat an exact attended Decision as authority for the choice it records. Do not
reopen that choice merely because an earlier MAP, PSP, STK, or Review predates the
Decision. When the latest QST and its exact Decision show that a preferential
Question is answered, do not report it as unresolved. Still fail a candidate that
contradicts the Decision, exceeds its effective scope, lacks exact authority, or
keeps a current unresolved Question. Never infer an answer or authority that is
absent from `context_members`.

For an implementation ART, derive the complete substantive changed-path set from
the exact Git commit and verify every and only candidate DES Revision is linked
and mapped to existing traversal-free relative paths. Exercise the controlled
public interface. Fail a missing DES mapping, nonexistent path, unjustified
changed path, mutable build reference, or non-runnable interface.

For a formal VAI, use only the exact VAI-only frozen sibling context. Verify its
formal VER, qualified ENV, executable procedure, source-blind provenance, and
separate authorization. Fail any product ART, product source, unit test, private
detail, prototype byte, or uncontrolled shortcut in the Assignment or context.
Each REV still has exactly one primary VAI subject even when sibling Reviews cite
the same immutable context.

For a pilot or formal VER, compare its observable behavior, claim scope,
acceptance criteria, expected success and discrimination activities, and evidence
requirements with the statement and verification intent of every exact
requirement Revision linked through `verifies-revision`. A wrong requirement
binding or a VER that tests different observable behavior is a primary blocking
finding against the VER and requires `outcome: fail`. Use the exact package
evidence to determine the correction.

For a completion DWP whose `target_child_type` is `DES`, compare the exact DES
context members with their exact CMP parents. Fail the coherent set if its DES
members only rename or restate their CMP parents without adding at least one
concrete implementable technical choice, such as an algorithm, state or data
flow, buffering, error behavior, or another product-relevant design constraint.
This criterion does not permit source files, symbols, product code, unit tests,
or verification implementation in DES.

A candidate linked through `changed-under` additionally receives
the bounded CHG and attended disposition; a replacement STK receives the same
change context so its judgment is scoped to the approved change.
For a Phase 2 planning DWP, they are its complete current SYS/ASP/ICSP definition
set. Use `review_kind:
simplification-product-definition` and challenge product purpose, stakeholder
intent, and scope. A passing Review has neither `simplification` nor `blocks`. A failed Review
records one exact `simplification.target`, every current blocking finding for
that target, and exactly one matching `blocks` link. Distinct targets are judged
and corrected serially through fresh candidate Reviews rather than encoded as a
cross-subject batch.

Record primary and collateral findings separately. Every primary blocking
Finding must name its exact `criterion`, concrete `evidence` or counterexample,
and `material_consequence`, and must satisfy the rubric's complete five-part
blocking test. Primary blocking findings force `fail`; usable concerns are
`needs-triage` or `advisory`, and collateral findings do not automatically fail
the subject. In Phase 2, add one exact `flags` link for every SYS, ASP, ICSP, or
DWP subject selected by a collateral Finding so normal reevaluation derives one
subject-bounded Correction with the complete immutable Review. Do not silently
edit the subject during review and do not inherit a prior reviewer’s outcome.

For every failed Review, classify the complete blocking finding set with
`correction_authority`. Use `stakeholder` when any truthful correction requires a
new choice or change to stakeholder-owned intent. Use `package-evidence` only
when the exact supplied package evidence determines the correction without that
choice. Never omit or default the classification. Do not include
`correction_authority` on a passing or cancelled Review.

Complete the REV as pass, fail, or cancelled and preserve exact prompt, skill,
policy, process, subject, and context provenance.

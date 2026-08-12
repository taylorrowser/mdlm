---
id: review-datum-in-context
version: 2
scenario: review-datum-in-context
---

# Review one datum in context

Read, in order:

1. `skills/lifecycle-data.md@1`
2. `skills/contextual-artifact-review.md@1`
3. `skills/traceability.md@1`
4. `skills/scope-challenge.md@1`

Review exactly one primary subject revision against the rubric resolved by
`review-applicability@1` using only its exact frozen context. Judge schema
validity, clarity, necessity, traceability, consistency with parents and siblings,
and type-specific quality. For PSP, STK, SYS, and candidate BSL subjects, apply
the corresponding rubric section.

The independent reviewer explicitly supplies `independent-reviewer` authority
for execution; the resulting REV, not reviewer prose or a completion summary,
is the durable judgment evidence.

Create one REV with exactly one `reviews` link and one `contextualizes` link.
Read every exact `context_members` input; the frozen context and its hash
manifest are not substitutes for the member contents. For an
`intent-level-candidate`, these members are its complete evidence-bearing
MAP/PSP/STK set. A candidate linked through `changed-under` additionally receives
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

Record primary and collateral findings separately. Primary blocking findings
force `fail`; collateral findings use `needs-triage` and do not automatically fail
the subject. In Phase 2, add one exact `flags` link for every SYS, ASP, ICSP, or
DWP subject selected by a collateral Finding so normal reevaluation derives one
subject-bounded Correction with the complete immutable Review. Do not silently
edit the subject during review and do not inherit a prior reviewer’s outcome.

Complete the REV as pass, fail, or cancelled and preserve exact prompt, skill,
policy, process, subject, and context provenance.

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
For an `intent-level-candidate`, this candidate is the earliest complete
evidence-bearing MAP/PSP/STK set: use `review_kind:
simplification-product-definition` and challenge product purpose, stakeholder
intent, and scope. A passing Review has no `blocks` links. A failed Review uses
`blocks` as the one canonical exact candidate/member correction set; its
structured findings explain the rationale applying to that complete set.

Record primary and collateral findings separately. Primary blocking findings
force `fail`; collateral findings use `needs-triage` and do not automatically fail
the subject. Do not silently edit the subject during review and do not inherit a
prior reviewer’s outcome.

Complete the REV as pass, fail, or cancelled and preserve exact prompt, skill,
policy, process, subject, and context provenance.

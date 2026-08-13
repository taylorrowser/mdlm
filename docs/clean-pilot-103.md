# Issue #103 clean-pilot proof

This is the durable audit record for the complete implemented-profile proof. The
pilot evidence is executable rather than a checked-in Lifecycle Data repository:
each public-process journey creates a new temporary repository, publishes through
`mdlm scenario submit`, and is discarded after its exact assertions. This prevents
a pilot repository or transcript from becoming runtime workflow state.

## Operator contract

The greenfield anchor is
[`test/mdlm-clean-pilot-contract.test.ts`](../test/mdlm-clean-pilot-contract.test.ts).
It proves the serial root loop starts with `mdlm init`, uses only `mdlm next`,
`mdlm scenario prepare`, and `mdlm scenario submit` for normal publication, runs
`mdlm doctor`, inspects the Lifecycle Data diff, makes an ordinary Git commit,
checks the tracked tree is clean, and then proves the next Assignment lease names
that exact committed `HEAD`.

The route journeys linked below use the same compiled `mdlm` process seam. Focused
package fixtures are retained only where a negative route needs exact prior
Lifecycle Data; they are evidence fixtures, not a second operator or runtime
state. Prototype-era adapter and direct-mutation paths are not part of the clean
operator anchor. Their final removal remains issue #104.

## Observed hardening routes

| Required observation | Exact executable evidence | Result |
| --- | --- | --- |
| Attended Product Wayfinding | `test/mdlm-review-correction.test.ts` | Product intent reaches attended gate judgment through exact Assignments. |
| Fresh delegated independent Review | `test/mdlm-review-correction.test.ts`; `test/mdlm-phase-1-assurance-correction.test.ts` | Every corrected Revision receives a new Review Context and a delegated `independent-reviewer` Assignment. |
| Lifecycle Correction | `test/mdlm-review-correction.test.ts` | A valid failed Review remains immutable, derives same-lineage replacement, and resumes through reevaluation. |
| Correction escalation boundary | `test/mdlm-review-correction.test.ts`; `test/mdlm-phase-1-assurance-correction.test.ts` | Two autonomous replacement cycles precede attended stakeholder escalation; transport retries do not affect this budget. |
| Consolidated checkpoint conversation | `test/operator-outcome.test.ts` | One compiled-public-seam `attention-required` outcome exposes the complete compatible Consolidation Group and first exact serial Assignment without persisting a transcript. |
| Gate rejection and return | `test/mdlm-review-correction.test.ts` | Reviewed rejection derives exact correction, fresh Review, superseding candidate, and attention at the same gate. |
| Shared requirement impact | `test/mdlm-shared-system-change-control.test.ts` | One SYS Stable Datum exposes two exact consumers and all affected evidence without copied lineages. |
| Formal change behavior | `test/mdlm-stakeholder-change-control.test.ts`; `test/mdlm-shared-system-change-control.test.ts` | Reviewed attended CHG disposition controls same-lineage replacement, selective rebuilding, reuse, and exact closure. |
| Explicit termination | `test/mdlm-pilot-assessment.test.ts` | Reviewed `proceed` and drained `change` report **Profile Boundary Reached**; reviewed `stop` reports **Lifecycle Complete**; none reports Process Dead End. |

## Matrix disposition

[`phase-hardening-matrix.md`](phase-hardening-matrix.md) is the human review
artifact. [`phase-hardening-coverage.yaml`](phase-hardening-coverage.yaml) is its
versioned proof index. `test/phase-hardening-matrix.test.ts` requires every matrix
section—including transport and liveness invariants—to name registered fixture or
public executable evidence, and requires every clean-pilot observation above to be
represented in that evidence set.

The matrix remains specification and test metadata only. The evaluator, Operator
Outcome classifier, Assignment lease, and Process Package never read it.

## Implemented-profile boundary

The clean proof deliberately stops at the selected package's declared outcome:

- `proceed` — **Profile Boundary Reached** at the omitted Phase 3–6 breadth;
- `change` — declared Phase 7 change-control work, then **Profile Boundary Reached**
  when supported work drains;
- `stop` — **Lifecycle Complete**.

No null work item, Process Dead End, old-pilot migration, direct Markdown mutation,
or adapter invocation is accepted as termination. Phase 3–6 expansion and the
clean-interface contraction tracked by issue #104 remain deferred.

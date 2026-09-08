# Process Package learnings

Operational demos between 2026-08-25 and 2026-09-03 closed 242 issues. Of the
labeled defects, 64 were Process Package defects and 19 were kernel defects.
This document turns the recurring defect classes into package rules and names
the check that should catch each class before a demo does. Update it when a new
class appears or when a check makes a class unreachable.

Each rule below is a package authoring obligation. Each check is either a
package-load diagnostic, a package-neutral test, or a kernel boundary. A rule
without a check is a request for one.

## 1. Every failable output needs a correction route

Issues: #470, #505, #507, #531, #571, #573, #585, #599, #610, #631, #653,
#664, #675.

Pattern: a Scenario publishes a Revision, an independent Review fails it or a
gate rejects it, and no Obligation in that Phase dispatches a same-lineage
correction. The lane reaches Process Dead End after dozens of accepted
transactions.

Rule: for every Phase, every output type that can receive a failing REV or a
rejecting gate DEC must have a correction Obligation and Resolver Scenario in
that same Phase whose output declares `identity_from` the failed input.

Check: a declaration-derived liveness proof in the package constraint compiler
that reports `contradictory` when a reviewable output type lacks a correction
route in a Phase where it is produced. Reverting any issue above must produce
that diagnostic.

## 2. Progression must not outrun its prerequisites

Issues: #559, #569, #580, #581, #583, #594, #636.

Pattern: Phase progression readiness is satisfied while an Obligation the
package intends as a gate prerequisite remains unsatisfied and unwaived, or a
Phase closes while late Reviews are still pending.

Rule: a Phase progression readiness expression must entail every Obligation the
package declares as a progression prerequisite, or the package must declare the
Obligation non-gating.

Check: the liveness proof lists Obligations bound to a Phase that are not
referenced by that Phase's readiness or gate expressions. Unreferenced
Obligations are `inconclusive` unless declared non-gating.

## 3. The packet and the schema come from one declaration

Issues: #493, #508, #509, #540, #547, #616, #622, #637, #642, #644, #650,
#662, #676, #679, #689, #694, #696, #725.

Pattern: the Assignment Packet, the author-only response schema, the
Scenario-fixed projected values, and cross-output references are assembled by
separate code paths. A fix to one path regresses another. Issues #679, #689,
#694, and #696 form one chain of regressions in the same seam.

Rule: fixed values, author-authored fields, and response-local references are
projected from one compiled Scenario contract. Fixed fields are excluded from
the authorable properties. The ordinary next/submit-proposal path emits
`authorValuesSchema` and `authorValuesScaffold` from the same field-ownership
rules used by submission. Prompts point to those fields; full response templates
remain diagnostic. Every response-local reference resolves at the canonical
final-proposal boundary.

Check: one package-neutral test compiles every Scenario in the selected
package, fills its scaffold with placeholder values, and asserts the compiled
proposal validates. A Scenario whose scaffold cannot round-trip fails package
qualification before any demo runs.

## 4. Review completion must compare evidence, not prose

Issues: #593, #602, #660, #669, #670, #691.

Pattern: a Review passes although its subject contradicts its exact requirement,
omits its declared reviewer, or reports observations that do not match the
recorded run. Pi239 reached Phase 6 with two such Reviews accepted.

Rule: every Review Scenario declares the mechanical fields it must compare
(observations, case inventory, reviewer, subject Revision) in its `completion`
contract, and the kernel materializes those comparisons at publication.

Check: Review Scenario `completion` expressions must reference each declared
mechanical field. Package load reports a Review Scenario with a prose-only
completion as `inconclusive`.

## 5. Corrections keep exact lineage identity

Issues: #451, #464, #468, #473, #501, #504, #642, #668.

Pattern: a correction output or a promoted baseline loses the identity of the
Revision it replaces, so later Selectors cannot find the replacement.

Rule: every correction output declares `identity_from` an exact input, and
every direct same-lineage completion contract binds identity.

Check: the existing #642 direct-lineage diagnostic, extended to every Scenario
whose `resolves` names a correction Obligation.

## 6. Prompts state copy rules for exact values

Issues: #502, #567, #612, #613, #615.

Pattern: an agent invents or abbreviates exact links, arrays, or levels because
the prompt described intent instead of the copy rule.

Rule: a prompt names every declared input by its input name, states the copy
rule for exact links and arrays, and never mentions a prohibited field.

Check: a prompt lint against the Scenario declaration. Package load reports a
prompt that omits an input name or mentions a prohibited input.

## 7. Generated artifacts are not committed

Issues: #478, #498, #553, #557, #561, #563, #574, #577, #589, #601, #634,
#640, #686.

Pattern: the canonical package fixture is a committed archive that must be
refreshed after every package edit. 70 of the last 200 commits on main are
fixture checkpoints or refreshes, and several issues exist only to repair
fixture provenance after squash merges.

Rule: derived artifacts live in an ignored cache keyed by the package and
loader source digests, so a change to either yields a new entry.
Tests rebuild the cache when it is missing or stale.

Check: repository validation fails if a generated artifact is tracked.

## 8. Declared inventory beats accumulated inventory

Measured on `mdlm-bootstrap@0.146.0`: 585 Selectors, 17 with no reference
anywhere in the package, 150 referenced exactly once, and 204 referenced only by
other Selectors. 30 of 93 Scenarios are `revise-*` correction routes that differ
from each other only in subject type, input names, and link names.

Rule: a Selector exists because a declaration outside `selectors/` needs it or
because two Selectors share it. A correction route is declared once per shape,
not once per subject type.

Check: package load rejects an unreferenced Selector. Correction routes are
generated from a compact per-type declaration, so adding a reviewable type
cannot omit its route.

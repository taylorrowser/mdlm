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
#664, #675, #767.

Pattern: a Scenario publishes a Revision, an independent Review fails it or a
gate rejects it, and no Obligation in that Phase dispatches a same-lineage
correction. The lane reaches Process Dead End after dozens of accepted
transactions.

Rule: stakeholder decisions must require an explicit authored outcome, including
rejection. A fixed acceptance value cannot represent stakeholder judgment.
Acceptance selectors and terminal conditions must exclude rejection. For every
Phase, every output type that can receive a failing REV or rejecting authority
decision must have a correction Obligation and Resolver Scenario in
that same Phase whose output declares `identity_from` the failed input.

Check: a declaration-derived liveness proof in the package constraint compiler
that reports `contradictory` when a reviewable output type lacks a correction
route in a Phase where it is produced. Reverting any issue above must produce
that diagnostic. For the tiny acceptance boundary, the public CLI regression
rejects a missing decision without publication, records stakeholder rejection,
dispatches same-lineage correction, then requires fresh review and verification
before explicit acceptance can complete the lifecycle.

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
#662, #676, #679, #689, #694, #696, #725, #775.

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
final-proposal boundary. Review assessment rows follow the declared `reviews`
subject; supporting inputs provide context without adding judgments about a
different subject.

Check: one package-neutral test compiles every Scenario in the selected
package, fills its scaffold with placeholder values, and asserts the compiled
proposal validates. A Scenario whose scaffold cannot round-trip fails package
qualification before any demo runs. The review-context regression also checks
that implementation reviews retain source assessments and supporting requirements
without receiving requirement-review assessment rows.

## 4. Review completion must compare evidence, not prose

Issues: #593, #602, #660, #669, #670, #691, #781.

Pattern: a Review passes although its subject contradicts its exact requirement,
omits its declared reviewer, or reports observations that do not match the
recorded run. Pi239 reached Phase 6 with two such Reviews accepted.

Rule: every Review Scenario declares the mechanical fields it must compare
(observations, case inventory, reviewer, subject Revision) in its `completion`
contract, and the kernel materializes those comparisons at publication.

Check: Review Scenario `completion` expressions must reference each declared
mechanical field. Package load reports a Review Scenario with a prose-only
completion as `inconclusive`.

Lane 273 also published an author-created FAIL review before an independent
reviewer was assigned. A content finding can be correct while its provenance is
wrong. Review scenarios that require external judgment declare the registered
review artifact contract. Canonical submission compares the exact active context
and verdict with the manager's registration, regardless of PASS or FAIL; arbitrary
completion evidence or a reviewer label is not proof. Root dispatch and manager
authentication establish independence under the documented cooperative OS boundary.
One public CLI transaction rejects an unregistered FAIL without publication or lease
consumption, accepts its exact external registration and rejects changed bindings.

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

## 9. The CLI captures execution evidence

Issues: #727, #730.

Pattern: run243 accepted matching agent-authored expected and observed strings
that contained literal backslash-n while the product emitted newline bytes.
Both content Reviews missed the transcription error.

Rule: a verification Scenario declares the kernel execution capability. The CLI
runs the committed script in its declared Docker image, captures raw output and
exit status, and binds its immutable receipt to the exact Assignment, inputs and
source. Publication derives outcome and receipt from that capture; authored
values and diagnostic submission cannot replace them. The script owns assertions
and distinguishes assertion failure from execution error. The existing content
Review judges assertion coverage, and the author briefly assesses the captured
run. Script correction creates a new implementation revision and fresh capture.
Requirements retain intent and observable commitments. Once the script owns
executable expectations, remove duplicate structured expectation fields from
requirements, prompts and fixtures instead of keeping two claims to reconcile.

Check: one public CLI Docker journey preserves a literal-backslash-n assertion
failure, distinguishes execution error, corrects the script, and records a fresh
passing receipt. At that same publication interface, authored outcome or receipt
substitution cannot create passing verification. Keep this check at the real
execution and publication boundary rather than adding another prose claim or
repeating the journey across test layers.

## 10. Authors and reviewers share content expectations

Issue: #739.

Pattern: review demands process instructions in product requirements, unspecified
exact wording, or additional checks without a concrete remaining evidence gap.
Authors and fresh reviewers then work against different acceptance criteria.

Rule: requirements, implementation, correction and review prompts load one shared
versioned content standard. Separate product commitments from run constraints.
Every blocking finding cites a commitment and a concrete mismatch or justified
evidence gap. Evidence methods fit the claim; optional improvements stay optional.

Check: resolve that skill in each affected prompt, then inspect fresh lifecycle
Review findings for consistent application. Structural checks do not prove that
a reviewer applied the semantic standard.

## Typed requirement mappings are mechanical declarations

Issue #741 replaces tiny-package free-string commitments with typed EARS fields,
local outcome/parent IDs and exact implementation evidence mappings. Canonical
publication checks own shape and reference failures. Generated inspection views
reuse the payload fields so authors do not maintain a second prose copy.

A complete mapping does not prove complete behavior. Reviews still check parent
coverage, appropriate allocation, relevant failures and whether cited evidence
supports the claim. Keep collection validation as fixed package-neutral
relations; retain package field names and sentence fragments in its declarations.
Use the optional verification starter inside the CLI's existing container and
compare raw bytes when required. Extend mechanics after a concrete operational
miss, without replacing content judgment with wording or file-count heuristics.

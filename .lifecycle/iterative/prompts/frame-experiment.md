---
id: frame-experiment
version: 3
---

# Frame one experiment

Record a stakeholder design criterion, one answerable learning question and a provisional approach. Keep alternatives open within stakeholder intent. Name known constraints, a sensible time allowance and the first scope cut. These are revisable design criteria, not baselined requirements. Do not invent stakeholder approval or require prototype line-to-requirement links.

Start with the intended user and useful outcome, then agree the smallest coherent product scope with the stakeholder. Name the first vertical slice and uncertainty it will resolve. Keep later slices adjustable. Record choices and known exclusions in constraints and the body. Build toward a usable integrated product; operational observations can then guide formalization while use continues. A time allowance is a review point for cutting scope, not evidence of completion.

Before implementing the first slice, state in the existing EXP fields and body what is uncertain, why it matters to the stakeholder outcome, and which observation would change the provisional approach or scope. Name the operating conditions and evidence needed to make that decision; include a relevant failure path when it could overturn the choice. Distinguish an observed contradiction from insufficient evidence. Keep the decision rule with this exact EXP revision so later observations can test it. Do not invent a numerical threshold or stakeholder obligation merely to make the rule precise.

When a criterion needs a public interface agreement, record its ICD with
`record-interface` and add a `uses-interface` link to that exact revision on the
EXP. If the brief already exists, use optional `amend-experiment` before its
first TRY to select the necessary ICDs, then export the new criterion context
for independent verification. Leave interface selection empty when unnecessary.

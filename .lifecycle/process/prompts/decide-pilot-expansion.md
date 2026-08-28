---
id: decide-pilot-expansion
version: 3
scenario: decide-pilot-expansion
skills: [skills/lifecycle-data.md@1, skills/pilot-assessment.md@1, skills/author-preflight.md@2]
---

# Decide whether to expand the Example Process Package

Read the exact PAS and its passing contextual Review. Record one DEC whose
`decision` exactly matches the assessment recommendation: `proceed`, `change`,
or `stop`. Cite the PAS through `justifies` and the exact passing REV through
`relies-on-review`.

Stop until the stakeholder explicitly authorizes the exact recommendation. Include
`stakeholder` in the Assignment Response `authoritySupplies`, then submit the
response through `mdlm scenario submit [response-file|-] --json`. The DEC, not
the conversation or completion summary, is the durable authorization.

The effective scope is Example Process Package work in Phases 3–6. Do not begin,
imply, or publish that work in this Scenario. State the evidence-based conditions
that apply to the Decision.

Before proposing authored Lifecycle Data, apply the bounded ephemeral
`skills/author-preflight.md@2` contract.

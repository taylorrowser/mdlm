# MDLM

MDLM helps people and agents keep software connected to the needs it serves. The goal is the smallest useful product that stays understandable, maintainable and reliable as those needs change.

Start with stakeholder intent, build small working slices, and learn from real use. Keep prototype decisions provisional. As understanding improves, record the requirements that matter, with the stakeholder making the final decisions.

Connect those requirements to readable code, interface agreements and independent verification. A maintainer should be able to understand why behavior exists, what a change affects, and what needs checking. When a need disappears, remove obsolete behavior while preserving shared functionality and the history behind the decision.

Verification starts from requirements, with clear actions and expected results checked against the actual product. Keep the evidence alongside the decisions. Every process step should help someone understand, decide, change or verify the product.

MDLM stores this information as versioned Markdown in Git. Its CLI gives agents available work and guidance; the agent chooses what to do next.

## Get started

- To develop MDLM in Codex cloud, follow [cloud setup](docs/CLOUD-DEVELOPMENT.md), then [development instructions](docs/agents/mdlm-development.md).
- For current priorities and migration handoff, read [next steps](docs/CLOUD-NEXT-STEPS.md).
- To build a product with MDLM, use Git, Node.js 24, npm and authenticated access to the private Process Package repository. Actual product verification needs Docker.

```bash
bash scripts/cloud-setup.sh
node dist/mdlm.js init ../my-product --process iterative
```

Run these from this repository. The product directory must be absent or empty.
Have the product agent read its generated `MDLM.md` at startup and on resume,
using the absolute path to this checkout's `dist/mdlm.js` wherever it says `mdlm`.
Provide the intended outcome, stakeholder contact and independent review contact.

The [operator guide](operator/MDLM.md) explains the work loop. The separately
versioned [Process Package repository](https://github.com/taylorrowser/mdlm-process-package)
owns process guidance. Existing products keep their selected kernel and package
until an [explicit upgrade](docs/upgrades.md). Read [release notes](RELEASE-NOTES.md)
before changing either.

# MDLM

MDLM helps people and agents keep software connected to the needs it serves. The goal is the smallest useful product that stays understandable, maintainable and reliable as those needs change.

Start with stakeholder intent, build small working slices, and learn from real use. Keep prototype decisions provisional. As understanding improves, record the requirements that matter, with the stakeholder making the final decisions.

Connect those requirements to readable code, interface agreements and independent verification. A maintainer should be able to understand why behavior exists, what a change affects, and what needs checking. When a need disappears, remove obsolete behavior while preserving shared functionality and the history behind the decision.

Verification starts from requirements, with clear actions and expected results checked against the actual product. Keep the evidence alongside the decisions. Every process step should help someone understand, decide, change or verify the product.

MDLM stores this information as versioned Markdown in Git. Its CLI gives agents available work and guidance; the agent chooses what to do next.

## Get started

Use Git, Node.js 24 and npm. Product verification also needs Docker.

```bash
git clone https://github.com/taylorrowser/mdlm.git
cd mdlm
npm ci
npm run build
node dist/mdlm.js init ../my-product --process iterative
```

The target directory must be absent or empty. Open it in your agent and have it:

1. Read the generated `MDLM.md` at startup and on resume.
2. Use `node /absolute/path/to/mdlm/dist/mdlm.js` wherever the guide says `mdlm`.
3. Start with your intended outcome, stakeholder contact and independent review contact.

The [operator guide](operator/MDLM.md) explains the work loop. The [iterative package](.lifecycle/iterative/README.md) explains the process. For an existing project, keep its selected release and package.

To change MDLM itself, read [development operations](docs/agents/mdlm-development.md).

## Upgrade an existing direct product

Run the chosen kernel executable inside the existing product. Installing or
choosing another kernel does not change the selected Process Package. Obtain an
exact compatible process release and its distribution `RELEASE-NOTES.md` locally;
upgrade commands perform no network lookup.

```bash
mdlm upgrade preview /absolute/path/to/distribution/iterative --json > /tmp/upgrade-preview.json
mdlm upgrade apply /tmp/upgrade-preview.json my-upgrade-001 --json
mdlm upgrade settlement my-upgrade-001 --json
mdlm process show --json
mdlm expectations --json
```

Preview includes the executing kernel version, exact old and target packages,
release notes, and required and optional work before and after the upgrade.
The target must declare `compatibility.repository_migration: compatible`.
This release supports the same package family and direct contract with unchanged
kernel contracts and capabilities, and preserved data valid under both authoring
and target schemas. Legacy assignment products and transforming migrations are
unsupported. A stale preview or changed artifact requires a fresh preview.

Apply atomically replaces `.lifecycle/process-selection.json`, which remains the
visible current pin. It retains old packages and lifecycle data. Its `upgradeReceipt`
binds an immutable Git object containing the exact descriptor, previous selection,
notes and operation; settlement recovers the result after response loss.
`.lifecycle/repository.json` remains the original repository compatibility contract.
The kernel checks that contract and the receipt chain rather than rewriting
historical review or acceptance evidence. Current expectations follow the selected
process; a new required action can reopen work without erasing historic acceptance.

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

The [operator guide](operator/MDLM.md) explains the work loop. The [iterative package](https://github.com/taylorrowser/mdlm-process-package/blob/main/iterative/README.md) explains the process. For an existing project, keep its selected release and package.

To change MDLM itself, read [development operations](docs/agents/mdlm-development.md).

Kernel and Process Packages release independently. `npm ci` installs the exact private package commit pinned in the lockfile and requires GitHub SSH access. Bare initialization uses tiny; named alternatives keep their existing behavior. To initialize with separately installed data, run `node dist/mdlm.js init ../my-product --package /absolute/path/to/package-root`. Existing products retain their selected local package. See [release notes](RELEASE-NOTES.md) for update impact.

Before replacing a kernel, inspect its installed binary with `mdlm --version` and `mdlm release-notes`. These read the installed artifact and need no product repository.

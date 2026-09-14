# MDLM

MDLM records engineering intent, design and implementation evidence as versioned lifecycle data. A process package describes useful data, prompts and relationships. The kernel validates exact references, authority and evidence, then publishes complete transactions while preserving history.

## Start and choose work

```bash
mdlm init /path/to/lifecycle
cd /path/to/lifecycle
mdlm expectations --json
mdlm expectations show <action> [<exact-subject>] --json
```

The default package supports requirements, implementation, verification, independent review, stakeholder acceptance and approved changes. Use `mdlm init /path/to/lifecycle --process exploratory` for experiments, prototypes, observations and stakeholder feedback.

The agent chooses available work. Discovery does not reserve work or force the first item. Guidance includes the package prompt, exact context, schemas and candidate examples. Keep functionality focused on the stakeholder's need; use experiments to learn before committing more detail.

## Publish and verify

Write a proposal from the guidance and submit it:

```bash
mdlm proposal submit proposal.json --json
mdlm proposal settlement <operation-id> --json
mdlm execution run <exact-implementation-or-prototype> <operation-id> --json
mdlm execution settlement <operation-id> --json
```

Each proposal names its action, operation, package, snapshot, candidates and evidence. Candidate references may name other candidates in the same transaction. MDLM assigns durable identities and derives managed fields. Execution captures the committed product, verification command, environment and actual result. A receipt can support only the matching work.

Settlement resolves lost responses without repeating completed operations. Inspect and commit accepted lifecycle data before continuing. Independent review and stakeholder decisions remain explicit; exploration is not product acceptance.

See [operator instructions](operator/MDLM.md), the [direct work contract](docs/contracts/direct-work.md), and the [Pi adapter](packages/mdlm-pi/README.md). Fresh repositories use the direct contract. Historical products stay on their selected installed versions; this release does not migrate their records.

## Development

Build with `npm run build`. See [development operations](docs/agents/mdlm-development.md) for focused checks, exact release qualification and operational evidence.

# MDLM

MDLM records engineering intent, design and implementation evidence as versioned lifecycle data. A process package describes useful data, prompts and relationships. The kernel validates exact references, authority and evidence, then publishes complete transactions while preserving history.

## Set up an agent session

For a fresh lifecycle repository, initialize an absent or empty directory:

```bash
mdlm init /path/to/lifecycle
cd /path/to/lifecycle
```

The default package supports requirements, implementation, verification, independent review, stakeholder acceptance and approved changes. Use `mdlm init /path/to/lifecycle --process exploratory` for experiments, prototypes, observations and stakeholder feedback. Use `--process iterative` for the experimental [useful-product-to-baseline route](.lifecycle/iterative/README.md), which keeps exploration and formal requirements in one lifecycle repository.

Initialization copies the shipped [operator guide](operator/MDLM.md) to `MDLM.md` at the lifecycle repository root. For an existing initialized project, open that root and keep its selected MDLM release and Process Package. An existing product without MDLM needs a separate fresh lifecycle directory; `init` does not import a populated project.

Configure your agent harness to load the project's `MDLM.md` before the lifecycle operator starts or resumes. Use the harness's project-instruction mechanism or supply this instruction in the session input. MDLM does not configure that mechanism or automatically load the guide into an agent's context.

Fill in this portable session input with real host bindings:

```text
You are the lifecycle operator for <project root>.
Read <project root>/MDLM.md before starting or resuming lifecycle work.
Stakeholder outcome: <intended useful result and agreed scope>.
Stakeholder contact: <person or authorized delegate and how to reach them>.
Authority: <decisions they may make and any explicit delegation limits>.
Review manager: <independent-review contact and host request mechanism>.
Use those host contacts for stakeholder decisions and bounded review requests.
```

The host must provide a reachable stakeholder with the required authority and a review manager who can arrange fresh independent judgment and register the result. A contact name alone grants no authority. If a binding is missing, the operator asks the host for it before dependent work continues. Review requests carry the exact subject and exported review context through the available host mechanism; the manager returns the bound proposal and judgment under the guide's review contract.

The lifecycle operator follows `MDLM.md` for the overall loop and retrieves action details from native CLI guidance, including the selected package's prompts and skills. Give bounded author or reviewer workers their assignment, exact context and relevant guidance. They return their assigned result to the operator or review manager; they do not take over the lifecycle loop. Keep independent reviewers separate from the author.

## Choose work

```bash
mdlm expectations --json
mdlm expectations show <action> [<exact-subject>] --json
```

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

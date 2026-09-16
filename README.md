# MDLM

MDLM helps you keep track of why your code exists. Start with what stakeholders want, document how that intent becomes requirements and code, and keep the links to the checks and decisions that support it.

That explanation needs to survive change. When stakeholders change their minds or maintenance changes the implementation, MDLM helps you document what changed, which code it affects, and what needs checking again. It preserves the history so the code and its explanation can stay in sync.

The aim is to do this without a big process up front. Start with a small useful product, learn from using it, and add detail as the work needs it. MDLM stores this information as versioned Markdown in Git. An agent uses its CLI to discover work, get guidance, and publish validated changes. The selected Process Package defines the steps.

## Get started with an agent

Build the current source with Git, Node.js 24 and npm. Docker is also needed when the agent reaches captured product verification.

```bash
git clone https://github.com/taylorrowser/mdlm.git
cd mdlm
npm ci
npm run build
export MDLM_CLI="$PWD/dist/mdlm.js"
mdlm() { node "$MDLM_CLI" "$@"; }
```

The `mdlm` shell function works in this shell after changing directories. In another session, use `node /absolute/path/to/mdlm/dist/mdlm.js` or recreate the function with that path.

Create a fresh project in an absent or empty directory:

```bash
mdlm init ../my-product
cd ../my-product
mdlm expectations --json
```

Initialization creates a Git repository and copies the [operator guide](operator/MDLM.md) to its root as `MDLM.md`. The default package guides a small product through requirements, implementation, verification, independent review and stakeholder acceptance, then supports approved changes.

To try building and learning before formalizing requirements, use `mdlm init ../my-product --process iterative` instead. This experimental [iterative package](.lifecycle/iterative/README.md) combines prototypes, feedback and formal acceptance in one project. Acceptance applies only to the scope actually reviewed and verified. For exploration alone, use `--process exploratory`.

Open the new project in your agent and give it this prompt, filling in the paths and contacts:

```text
Read /absolute/path/to/my-product/MDLM.md before starting or resuming work.
Use node /absolute/path/to/mdlm/dist/mdlm.js wherever the guide says mdlm.

Stakeholder outcome: <what we want to build and the smallest useful scope>.
Stakeholder contact: <who to ask and how to reach them>.
Authority: <decisions they can make and any explicit delegation limits>.
Review manager: <who can arrange independent review and how to request it>.

Follow the guide and the selected package's CLI guidance.
Start with the smallest useful result. Ask the stakeholder when intent is unclear.
Use the contacts above for required decisions and independent reviews.
```

Your agent host must load `MDLM.md` at startup and on resume; MDLM does not configure that for you. The stakeholder must have authority to make the requested decisions, and the review manager must be able to arrange a fresh reviewer and register the result. If either contact is missing, the agent asks before doing work that depends on it. Authors cannot review their own work.

For an existing MDLM project, keep its selected release and Process Package and read its `MDLM.md`. Initialization does not import a populated codebase; start in a separate fresh directory.

## Working day to day

Tell the agent the desired outcome or what changed. It reads available work with `mdlm expectations --json`, retrieves the chosen action's guidance, and follows the operator guide to publish changes, verify the product and request review or stakeholder decisions. Keep the scope small and use actual product use to decide what to do next.

The [operator guide](operator/MDLM.md) covers proposals, execution and recovery. The [direct work contract](docs/contracts/direct-work.md) describes the CLI contract; the [Pi adapter](packages/mdlm-pi/README.md) connects it to Pi. For work on MDLM itself, see [development operations](docs/agents/mdlm-development.md).

# Work on MDLM in Codex cloud

Use the current Codex Cloud environment workflow. It can check out both repositories
in one environment, while each task has its own workspace. Configure an Install
script and optional Start skill, test setup, then Publish. Changes to the reusable
setup need Republish; existing tasks keep their state. Repository refresh does not
rerun installation. See [OpenAI's cloud environment guide](https://learn.chatgpt.com/docs/environments/cloud-environments).

## Create the environment

1. In Codex, choose **Work in > Cloud > Select environment > Create environment**.
   Select private repositories `taylorrowser/mdlm` and
   `taylorrowser/mdlm-process-package`. Connect GitHub if needed.
2. Ask setup to provide Git, Node.js 24, npm and access to the pinned private Git
   dependency. Configure network access for GitHub and the npm registry as needed.
   Use environment or personal-vault secrets for credentials. Repository checkout
   permission does not establish npm's shell Git authentication.
3. Set the Install script to change into the discovered kernel checkout and run
   `bash scripts/cloud-setup.sh`. Use the path that setup actually reports; there
   is no required EC2 or `/workspace` layout. The script installs the lockfile,
   builds the kernel, initializes a disposable product, reads its selected process
   and available work, then reports Docker daemon availability separately.
4. Test the required commands in that environment. MDLM itself has no persistent
   service to start. A demo may add a Start skill with its own launch command and
   readiness check. Keep independent verification tasks source-free as described below.
5. Review the setup results and Publish. Start a fresh task and run
   `node scripts/cloud-check.mjs` from the kernel checkout. Setup readiness is
   established only after these checks succeed in the actual cloud environment.

The setup scripts are also ordinary local commands. An EC2 run of them is evidence
about those scripts on EC2, not proof that a cloud environment is ready.

Use this as the first setup request:

> Prepare the checked-out mdlm and mdlm-process-package repositories for development.
> Read mdlm/AGENTS.md and docs/CLOUD-DEVELOPMENT.md. Locate both checkout roots.
> Use Node.js 24 and authenticated access to the exact private dependency in
> package-lock.json. In the kernel checkout run bash scripts/cloud-setup.sh and
> npm run typecheck. Validate the process checkout using its CONTRIBUTING.md.
> Report exact Git commits, all command results, Docker availability and any
> unsupported runtime checks. Do not change the pinned dependency or resume an
> archived lifecycle. Leave missing credential setup to the environment's secret UI.

## Private dependency authentication

`npm ci` fetches the exact `mdlm-process-package` Git commit from the lockfile.
The adjacent package checkout is for editing and validation; it does not replace
that dependency. The kernel pin can differ from the editable process checkout and
an archived product's selected package. The smoke command reports the installed
package identity. Keep the lockfile unchanged during environment setup.

First try the environment's configured Git authentication. If it uses HTTPS but
npm's pinned Git URL uses SSH, configure a GitHub URL rewrite in this disposable
cloud environment. With a working authenticated GitHub CLI, one supported Git
credential-helper setup is:

```bash
gh auth setup-git --hostname github.com
git config --global url.https://github.com/.insteadOf ssh://git@github.com/
git config --global --add url.https://github.com/.insteadOf git@github.com:
GIT_TERMINAL_PROMPT=0 git ls-remote https://github.com/taylorrowser/mdlm-process-package.git HEAD
bash scripts/cloud-setup.sh
```

Run from the kernel checkout. These commands configure the environment's Git
helper and transport; they do not acquire a credential. Supply a credential with
read access to the private package through the cloud secret settings, or use an
already configured secure helper. If `gh` is unavailable, have environment setup
configure an equivalent Git HTTPS helper. Never put a token in a repository URL,
lockfile, committed configuration, prompt or log. Avoid dumping Git configuration
or environment variables while diagnosing authentication.

Current cloud environments distinguish direct environment variables from network
secrets. Network secrets use placeholders with proxy substitution for allowed
HTTPS destinations. Configure a secret type that the actual Git helper supports
and test the private fetch; do not assume a placeholder works with every CLI.
See [environment access settings](https://learn.chatgpt.com/docs/environments/cloud-environments).

## Daily development

Read [development instructions](agents/mdlm-development.md), claim the issue and
use one task branch per repository. Check peer PRs before changing shared files.
Return changes as PRs with exact check results and independent review. A change
across both repositories uses two linked PRs and retains separate versioning.

If repository refresh changed the lockfile, rerun `bash scripts/cloud-setup.sh`.
After source-only changes, rebuild before exercising the CLI. Republish reusable
environment changes and verify a fresh task; installing something inside one task
only updates that task.

Use GitHub issues and PR comments for decisions, blockers and handoffs. Message
Board and host controllers are optional adapters, not prerequisites. Repository
instructions travel with Git; personal EC2 skills and configuration do not.
Keep useful task guidance in this repository or the owning Process Package.

## Verification capability and independence

`cloud-check.mjs` probes the Docker daemon, but deliberately reports actual product
verification as `not-run`. A reachable daemon does not prove that an image can
start with the required mounts, network policy, nonroot user and tools. The first
runtime demonstration must exercise the selected MDLM execution contract and
retain its receipts and results. See [native verification](contracts/direct-work.md#native-verification-runtime).

If Docker or the required runtime is unavailable, continue source checks that do
not need it and list runtime checks as not run. Transfer exact committed inputs to
an authorized capable runner before claiming verification. Keep unsupported
runtime checks visible in the PR and release handoff.

Current cloud limitations list computer/browser use as unsupported. Headless
Playwright through shell commands is a separate capability that must be tested;
interactive stakeholder demonstrations from EC2 do not transfer automatically.
See [cloud limitations](https://learn.chatgpt.com/docs/environments/cloud-environments).

A development environment containing product source is not automatically a suitable
independent verifier environment. Give a fresh verifier only the exact requirements
projection, decomposition/interface context and public launch contacts. Use a
separate task or workspace with restricted inputs when needed. Freeze expected
actions and results before adapting prior verifier mechanics. Keep product source,
product tests and prior verdicts/results out of expectation authoring. Reviewers
receive the relevant lifecycle neighborhood and history for their assigned review.

## Transfer existing work

Follow [current priorities and the migration handoff](CLOUD-NEXT-STEPS.md). Preserve
full lifecycle Git history, local selected packages, receipts, execution artifacts,
product/verifier commits and stakeholder data in durable private storage. Verify
hashes and required Git objects after transfer before resuming. A branch checkout
alone does not contain ignored artifacts or unpushed history.

Record who owns the next operation. Settle uncertain operations using their original
IDs and stored receipts; migration is not permission to rerun them. Existing accepted
history keeps its original identities. Kernel and process upgrades remain explicit
operations under [the upgrade guide](upgrades.md).

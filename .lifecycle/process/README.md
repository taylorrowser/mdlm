# Tiny product Process Package

`mdlm-tiny@0.2.0` is the default Example Process Package. It has one requirement
level and one phase. It targets small, terminating command-line products with
UTF-8 input and output. Earlier package history remains in Git.

The normal journey is six Assignments:

1. Write one `REQ` containing the stakeholder request source, intent, observable
   commitments.
2. Independently review that content in one `REV`.
3. Implement the product and verification script, recording one `IMP` linked
   to the exact reviewed `REQ`.
4. Run the committed verification script through the CLI in Docker and assess
   its captured result in one `RES`.
5. Independently review the implementation and execution evidence in one `REV`.
6. Obtain stakeholder acceptance in one `ACC` linked to the exact product,
   requirements and passing evidence.

There are no architecture, decomposition, qualification, baseline preparation,
review-context preparation or gate-signoff Assignments. Reviews judge meaning
and evidence quality. The CLI checks schema, identities, exact links, publication
contracts, execution receipts and script exit classification before publication.

Requirements state intent and observable commitments. Concrete examples may appear
in prose when useful. The committed verification script is the only executable
expectation format, including input, argument and file assertions. Its exit 0
means pass, exit 1 means assertion failure, and other exits mean execution error.
Handle unexpected script exceptions separately from assertion failures.

The implementation records an absolute `repository_path`, exact `source_commit`,
product `command` argv and `product_files`, digest-pinned `verification_image`,
`verification_command` argv, and relative `verification_script`. The CLI runs
`mdlm assignment run --json` against a clean snapshot of that commit in Docker.
Source is read-only at `/workspace`; `/tmp` is writable and network is disabled.
Use a prebuilt runtime image. Custom image builds are outside this tiny route.

The CLI captures raw stdout/stderr and exit status in an immutable receipt and
supplies `RES.outcome` and `RES.receipt`. Authors supply a short `assessment` and
`correction_target`: `none` for pass, otherwise `requirements` or `implementation`.
Script defects belong to implementation correction. Repeating the run command
reuses its completed receipt. A failed environment attempt stays recorded; `mdlm assignment run --retry --json` permits a new attempt after environment repair. The
existing independent product Review judges script coverage and assertion logic.
A passing exit status alone cannot establish adequate verification.

All submitted data freeze immediately. A failed content Review routes directly
to a same-lineage correction. A wrong expectation revises the `REQ`, receives a
fresh Review, then rebinds the existing `IMP` lineage to the new exact `REQ`.
Unchanged code retains its source commit. A wrong product or verification script revises its `IMP`.
Both routes require fresh execution, implementation Review, and stakeholder
acceptance. Prior failures remain inspectable and cannot satisfy the new revision.

Keep product source in a separate Git checkout. Record its exact commit and execution fields in `IMP`. The lifecycle repository HEAD must not
change while an Assignment is open, because its lease binds that repository
state. A future same-checkout improvement should change that owning command
contract rather than bypass its stale-Assignment check.

`Lifecycle Complete` means a current, passing, independently reviewed product
has stakeholder acceptance. This package has no early-stop completion or
profile-boundary success. Requirement changes beyond correcting the tiny
product and larger architecture are intentionally outside this first loop.

Use operational evidence to improve this package. When an Assignment exposes a
mechanical field or avoidable review step, fix its owning schema, scenario,
prompt or CLI contract in the same session. Keep the improvement here or in the
owning instruction so the next agent receives it. Add lifecycle complexity only
when a demonstrated product need earns its cost.

## Structured requirements and evidence

REQ stores stakeholder `outcomes` and EARS `commitments` in one publication. Local
IDs connect outcomes, optional allocated parents and IMP `verification_coverage`.
The CLI checks shape, uniqueness, reference existence, parent cycles and declared
mapping coverage before publication. Content review judges whether the behaviors
collectively meet the request and whether cited evidence establishes each claim.

`mdlm show <exact-revision>` renders the package's outcome, commitment and evidence
views. JSON output carries the same rows in `projections.views`. Assignment schemas
include the collection declarations and display fields. The automatically loaded
`skills/typed-requirements.md@1` explains authoring; implementation prompts also
include `skills/verification-starter.md@1`, an optional raw-byte Python example.

# Cloud handoff and next work

Status recorded 10 October 2026. Start with [cloud setup](CLOUD-DEVELOPMENT.md)
and the [development instructions](agents/mdlm-development.md). Source setup,
evidence restoration and actual cloud verification are separate milestones.
Neither restoring the experiment nor running its product in cloud is complete.

## What we are trying to achieve

Every necessary behavior should trace to stakeholder intent, have sufficient
requirements and verification, and remain understandable when it changes.
Requirements quality is the main outcome of the demonstrations.

Use stakeholder requirements for needed outcomes, system requirements for
integrated behavior and allocation to systems, software HLRs for the behavior of
an allocated software item, and LLRs for its precise decisions and responses.
Add another system level when a real boundary needs it. Each requirement should
state one well-scoped obligation. Review children against their immediate parent
and check that together they carry all its obligations. Architecture documents
explain boundaries and choices; they must not hide untraced obligations.

Judge this through additions, changes and removals. Review previous behavior,
justify intended removals, preserve valid alternatives, and verify the resulting
product independently. Requirement counts and trace links alone do not establish
completeness.

## Where the current experiment stopped

Energy Desk is a browser product for meter readings, room/site energy consumption,
budgets and operator acknowledgments. Its accepted baseline has 31 requirements:
5 stakeholder, 6 system, 9 software HLR and 11 software LLR, with 15 decomposition
records. The dated-budget change has 34 requirements and passed independent
requirements review, but its product verification and acceptance are unfinished.

| State | Essential identity |
| --- | --- |
| Accepted product | `3d27b5555f492a95055b4d419686d4cf1a5fcfe7` |
| Current lifecycle | `65e9b577fd1324c1ebbfe2f1a1c03bcd9b8d68f7` |
| Changed, unverified product | `7aefb14422ae626f68015da38c5cb5eb4df65ae7` |
| Prepared verifier, controls unexecuted and adapter missing | `a6634cf47be17819aaf16af25e1721eddb2097d8` |

The lane selects kernel `22bb1808327f14d20943ff5abcb3db6af3a93cbf`, process
`mdlm-iterative@2.5.39`, and runner
`2df0a9f2fb2aae740b1c03da6f56fced32b8eacb`. Preserve its recorded package digest
and installed identity during transfer. Current development branches and the
ordinary release-availability pointer are separate selections.

Two rebind attempts were explicitly not published. The current verification
activity must be completed and independently reviewed before a fresh rebind.
Keep both failure records and resolve their recovery instructions; do not replay
the old operations or assume this establishes a kernel defect.

## Next tasks

1. **Prove cloud setup and preserve the experiment.** Run the checkout's focused
   build/tests, establish an actual verification runtime, and restore the required
   private evidence and Git histories. Done when a fresh task can authenticate
   the exact selected identities and required artifacts without the EC2. A source
   clone alone is insufficient. Keep the EC2 evidence until restoration is checked.
2. **Finish the dated-budget change.** Supply the existing public operating
   contact, complete the verifier adapter and declared controls, review the method,
   publish the valid activity, then rebind and verify the product. Exercise migration
   using a copy of retained stakeholder data. Done when the lifecycle records the
   actual results, independent review, justified changes/removals and acceptance,
   with both recovery loops closed.
3. **Add an external meter producer and ICD.** Introduce one real cross-system
   interaction. Done when producer/consumer obligations are allocated, traced and
   independently verified, including a failing interaction. Review system-to-HLR
   and HLR-to-LLR decomposition before adding more functionality.
4. **Exercise another compatible process upgrade.** Start from preserved product
   history, inspect update notes, preview/apply the selected upgrade, and resolve
   the resulting work. Done when retained history and newly required work are
   demonstrated. The existing 2.5.38-to-2.5.39 experiment does not establish arbitrary
   schema migration. Follow [the upgrade procedure](upgrades.md).
5. **Replace an implementation using the lifecycle data.** Use another language
   with the same declared public behavior and independently derived expectations.
   Done when the replacement passes and any gaps in requirements, interface
   obligations or verification are documented and corrected.
6. **Choose the next real pilot from the evidence.** Review each run's requirement
   quality, missing behavior, interventions and maintenance cost. Fix the smallest
   owning package instruction or kernel behavior that caused an observed problem.
   Increase complexity after a manageable run succeeds. Define the kernel through
   its own lifecycle only when these results justify that next step.

## Evidence and parallel work

The private EC2 experiment is under the successor campaign
`operations/autonomous-quality-20260929`. Its root is not a Git repository.
Several product/lifecycle repositories have local-only remotes, and verifiers
have no remote. GitHub source repositories do not contain this complete history.
The later `AUTHOR-FINAL-036.json` and verifier
`FINAL-STAGE2-PREPARATION.json` supersede the checkpoint's earlier progress summary.
Historical worker names do not establish current cloud ownership.

Transfer Git histories and the referenced non-Git evidence to approved private
storage. Preserve hash-bound bytes and record relocated paths separately. Never
rewrite old evidence to fit a new workspace. Keep credentials and account sessions
out of the export. Use the setup repository's [migration handoff](https://github.com/taylorrowser/setup/blob/docs/mdlm-cloud-handoff-20261010/mdlm-codex-cloud-handoff.md)
and [inventory](https://github.com/taylorrowser/setup/blob/docs/mdlm-cloud-handoff-20261010/mdlm-cloud-inventory-20261010.md)
for transfer and retirement checks. These links identify the migration branch.

Before overlapping work, recheck the latest state of
[process-package PR 27](https://github.com/taylorrowser/mdlm-process-package/pull/27)
and [kernel PR 999](https://github.com/taylorrowser/mdlm/pull/999). Both were open
when this handoff was written. Preserve the other agent's work and record exact
candidate identities in each new issue/PR handoff.

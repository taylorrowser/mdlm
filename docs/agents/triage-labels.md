# Triage labels

The engineering skills use five canonical triage roles. This repository maps them directly to GitHub labels.

| Label in engineering skills | Label in this tracker | Meaning |
| --- | --- | --- |
| `needs-triage` | `needs-triage` | Maintainer needs to evaluate this issue |
| `needs-info` | `needs-info` | Waiting for missing information or a decision |
| `ready-for-agent` | `ready-for-agent` | Fully specified, unblocked, and unclaimed |
| `ready-for-human` | `ready-for-human` | Requires human implementation |
| `wontfix` | `wontfix` | Will not be actioned |

Use one triage role when an open implementation issue is waiting. Remove `ready-for-agent` when an agent claims the issue.

## Active ownership

| Label | Meaning |
| --- | --- |
| `agent:in-progress` | An agent owns the issue now. Other agents must skip it. |

The claim protocol lives in `docs/agents/issue-tracker.md`. `agent:in-progress` and `ready-for-agent` are mutually exclusive.

## Defect origin

Apply exactly one `defect:*` label to an issue that tracks observed incorrect behavior. Classify the component whose contract is wrong, not the file most likely to change.

| Label | Use when the wrong behavior belongs to |
| --- | --- |
| `defect:kernel` | MDLM's engine, evaluator, expression runtime, CLI, repository integrity, or publication capabilities |
| `defect:process-package` | Process Package scenarios, selectors, prompts, policies, schemas, or lifecycle allocation |
| `defect:orchestrator` | Runner control flow, checkpointing, recovery, command execution, publication closure, or attended-input handling |
| `defect:qualification` | Test scheduling, release gates, builds, artifact assembly, or qualification evidence tooling |

Feature requests, roadmap epics, and documentation changes get no `defect:*` label unless they also track observed wrong behavior. Existing `area:*`, `bug`, `enhancement`, and `type:*` labels remain optional descriptors. They do not replace the defect-origin label or triage state.

When evidence changes the diagnosis, update the origin label and leave a short comment explaining why.
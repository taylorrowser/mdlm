# Agent instructions

Before development or a demo, read [development instructions](docs/agents/mdlm-development.md).
For environment setup, read [Codex cloud setup](docs/CLOUD-DEVELOPMENT.md).
At task start and resume, read the issue, its latest comments and the task handoff;
confirm the branch, exact commit and outstanding operations before continuing.

Claim work through [the issue tracker](docs/agents/issue-tracker.md) before editing.
Keep one writer per task branch, lifecycle repository and shared evidence record.
Use independent agents or separate cloud tasks for review and requirements-only
verification. Give each a bounded assignment and the exact inputs it may inspect.
If independent execution is unavailable, leave that review or verification pending.

Use GitHub issues and PRs for durable coordination. Cloud work does not require
EC2 paths, a host fleet, Message Board access or a background controller.
Preserve existing campaign evidence when transferring it; moving environments
does not authorize replaying uncertain operations or accepting a product.

Before triage, follow [triage labels](docs/agents/triage-labels.md).
Before changing domain concepts, read [domain instructions](docs/agents/domain.md).
When operation exposes avoidable friction, fix the smallest owning instruction
or command in the same change, or record a bounded follow-up issue.

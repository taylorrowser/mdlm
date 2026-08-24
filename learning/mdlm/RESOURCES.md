# MDLM resources

## Knowledge

- [Repository README](../../README.md)
  Current supported operator contract, commands, outcomes, and stop conditions. Use for all operational lessons.
- [Canonical domain language](../../CONTEXT.md)
  Current definitions and distinctions. Use whenever a term's exact meaning matters.
- [Example Process Package README](../../.lifecycle/process/README.md)
  Current package ownership boundary, implemented profile, and supported phases. Use for package-level behavior.
- [Selected Process Package](../../.lifecycle/process/manifest.yaml)
  Normative catalogs and package references. Use to trace a live definition from its manifest entry to YAML.
- [MDLM Pi operator README](../../packages/mdlm-pi/README.md)
  Current automated harness behavior, recovery boundaries, Git transaction handling, and terminal outcomes.
- [Implementation conformance report](../../docs/mdlm-v0.8-implementation-conformance.md)
  Evidence for the earlier concept-validating profile. Its package identifier is stale, so verify current versions and behavior against the live manifest, package assets, and tests.
- [Historical process overview](../../docs/mdlm-process-overview-v0.8.md)
  Historical design background only. It explicitly is not supported operating guidance.
- [`src/`](../../src/)
  Kernel and CLI implementation. Use after the public contracts are understood.
- [`test/`](../../test/)
  Executable examples of evaluator, repository, Assignment, Scenario, and hardening behavior.

## Wisdom (Communities)

No external community is listed yet. MDLM is repository-specific, so current maintainers and issue discussions are the first place to test design judgments.

## Gaps

- The 64 live Scenarios have been inventoried, but each still needs a teaching example showing its trigger, exact inputs, outputs, authority, and effect on reevaluation.

# Teaching notes

- The learner prefers 10–20 minute lessons.
- Keep the course contained under `learning/mdlm/` and tracked in Git.
- Teach operator behavior first, then unpack the evaluator and package definitions that cause it.
- The learner has a partial model of Lifecycle Data, Scenarios, the CLI, and repeated agent work. Test distinctions among Obligations, Loose Ends, Scenarios, Assignments, and Operator Outcomes before assuming fluency.
- Current source boundary: `mdlm-bootstrap@0.73.0`, profile `bootstrap@37`, 64 Scenario YAML files. Treat `src/`, `test/`, and `.lifecycle/process/` as live; treat the v0.8 overview as historical.
- Planned dependency order after the operator loop: Lifecycle identity; kernel/package ownership; package loading; expressions; primitives and derivation; obligations and dispatch; phases and outcomes; Scenario transactions; authority; review and Correction; package routes; diagnosis.

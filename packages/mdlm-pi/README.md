# MDLM Pi

`mdlm-pi run <repository>` performs one chosen piece of direct lifecycle work. The agent reads available work, chooses an action and exact subject, then receives the package guidance. The controller transports the resulting proposal through the public CLI. It does not rank work or allocate it.

```bash
mdlm-pi run /path/to/lifecycle --mdlm /absolute/path/to/mdlm --provider <provider> --model <model>
```

Discovery uses `expectations`; guidance uses `expectations show`. When guidance requires missing execution evidence, the controller invokes `execution run` before asking the agent to assess it. It publishes through `proposal submit`. Accepted data remain available for inspection and commit by the lifecycle operator.

The controller collects stakeholder answers through attended IO and supplies authority outside the model-authored candidates. Independent review returns an `independent-review-required` stop with exact guidance so a separate reviewer and manager can export context, register the verdict and submit its exact proposal through the direct CLI. The author cannot provide its own independent review.

A durable operation journal records the operation kind, proposal digest, package, snapshot and transport. If a command response is lost, the next invocation consults proposal or execution settlement before discovery. An uncertain execution remains stopped. A rejection returns diagnostics and preserves the journal until settlement confirms publication or nonpublication. It does not silently retry or manufacture replacement work.

Pi sessions use `complete_work` for structured selection or authored values. Product source tools are available during authoring. The controller owns lifecycle commands and publication. Each task has an isolated session; provider retries, timeouts and cancellation remain bounded. `MDLM_PI_WORK_TIMEOUT_MS` controls task duration, `MDLM_PI_COMMAND_TIMEOUT_MS` controls subprocess duration, and `MDLM_PI_PROVIDER_RETRIES` controls provider retries.

Attended input supports `MDLM_PI_ATTENDED_INPUT_MODE=framed-v1`, `terminal-delimiter`, or `legacy-eof`. Framed input uses `MDLM-ATTENDED/1 <UTF-8-byte-count>\n<payload>` and retains the next frame. Terminal input ends with a line containing `.mdlm-submit`. Inputs are strict UTF-8 with a 64 KiB limit.

The operation journal and owner lock live in Git-private state. Preserve them after ambiguous closure. Operational error documents retain bounded, redacted provider telemetry.

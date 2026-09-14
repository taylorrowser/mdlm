# Exploratory Process Package

`mdlm-exploratory@1.0.0` is a fresh-only direct process for bounded runnable prototypes. It records an EXP learning question, a TRY with exact committed source, an execution-backed OBS and stakeholder FDB when a prototype is nominated for feedback.

Use `mdlm expectations --json` to inspect missing work and `mdlm expectations show <action> [<exact-subject>] --json` for package prompts and exact context. The agent chooses which available work to perform. `mdlm proposal submit <file> --json` atomically publishes the proposed data. Completed publication and execution operations can be recovered by their settlement commands without replay.

The package preserves separate revision paths. An OBS recommending revise creates an EXP revision responding to that observation. Stakeholder feedback requesting criteria changes creates an EXP revision responding to the FDB. Feedback requesting prototype changes creates a TRY revision responding to the FDB. Each revision preserves the previous brief, source and evidence.

Passing execution allows keep, drop, revise or nominate. Failed or errored execution allows only revise or drop. Nomination needs stakeholder feedback and grants no requirement or product approval. Keep, drop and an explicit stakeholder stop close the exploratory boundary. This boundary is not product acceptance or a requirements baseline.

Prototypes need no complete requirement graph or source-line attribution. Prefer the smallest slice that answers the learning question, and record the limits of the evidence. Promotion, partial baselines, TTY-dependent verification and resuming a closed experiment remain outside this package.

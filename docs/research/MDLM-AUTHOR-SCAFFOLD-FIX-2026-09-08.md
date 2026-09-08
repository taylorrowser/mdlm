# Author-values scaffold fix

Issue [#725](https://github.com/taylorrowser/mdlm/issues/725) addresses the authoring interface mismatch observed in the pinned Terra low run on source `93ee63db6068f2f7a2d89b71266c3663f9c2a6f4`. The run and its installed artifact were not changed or coached by this fix lane.

The ordinary packet previously emitted only the full response template while its command accepted author values. The new packet emits `authorValuesSchema` and `authorValuesScaffold`. The scaffold includes the exact slot, an empty body, required authored payload placeholders, and completion evidence. It removes fixed values and kernel-owned fields using the same ownership function as submission. It retains existing conditional placeholders from the canonical response projection. Materialized outputs remain kernel-owned. Repeated slots include a response-local handle.

The author schema describes authorable field structure and excludes protected fields. Canonical submission still checks the original full payload schema, conditional rules, slot cardinality, and Scenario completion after deriving fixed values. This does not add another semantic compiler or relax validation. The installed guide, normal operator instructions, and tiny prompts identify the ordinary template explicitly. Full response schema/scaffold fields and diagnostic commands remain available.

Both new packet fields are additive. Their TypeScript fields remain optional for historical v3 packets and frozen fixtures; every newly rendered packet emits them. The public regression asserts their presence through the real compiled executable. Existing historical fixture tests continue to pass without pretending they contained the new fields.

## Verification

One public regression initializes a disposable tiny repository, calls `next`, fills the emitted scaffold without changing its structure, checks it against the emitted schema, and submits through `assignment submit-proposal`. It also verifies the author schema rejects an added fixed publication value and a full response wrapper. No agent judgments or product execution are claimed by this regression.

All commands used the shared development lock and `/usr/bin/time`. The initial compiled-source regression failed because `authorValuesScaffold` was absent, in 1.60 seconds with 135528 KiB peak RSS. During implementation, typechecking caught an Ajv inference issue and a test import issue; both were corrected. The initial test expectation also omitted the inherited required title field and was corrected to fill it.

Final focused results:

- `npm run typecheck`: passed, 3.92 seconds, 520472 KiB peak RSS.
- `npm run build`: passed, 2.90 seconds, 406900 KiB peak RSS.
- `vitest run test/author-values-scaffold-public.test.ts test/operator-contract-v2.test.ts test/tiny-process-package.test.ts`: 9 tests passed, 2.73 seconds, 231680 KiB peak RSS.
- `git diff --check`: passed.

The new regression is included in the current cutover test selection. No full suite, release qualification, installed-artifact qualification, or fresh autonomous run was performed. A fresh Terra low run on a qualified artifact is still needed to measure whether these instructions remove the observed wasted attempts.

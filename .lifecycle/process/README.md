# Tiny product Process Package

`mdlm-tiny@0.1.0` is the default Example Process Package. It has one requirement
level and one phase. It targets small, terminating command-line products with
UTF-8 input and output. Earlier package history remains in Git.

The normal journey is six Assignments:

1. Write one `REQ` containing the stakeholder request source, intent, observable
   commitments, and readable acceptance cases.
2. Independently review that content and the expected outputs in one `REV`.
3. Implement the product and record one `IMP` linked to the exact reviewed `REQ`.
4. Execute the command for every case and capture observations in one `RES`.
5. Independently review the implementation and execution evidence in one `REV`.
6. Obtain stakeholder acceptance in one `ACC` linked to the exact product,
   requirements and passing evidence.

There are no architecture, decomposition, qualification, baseline preparation,
review-context preparation or gate-signoff Assignments. Reviews judge meaning
and evidence quality. The CLI checks schema, identities, exact links, publication
contracts and the expected/actual comparison before accepting submissions.

Each case is an object with `id`, `stdin`, `stdout`, `stderr`, and `exit_code`.
The CLI rejects duplicate case IDs, missing or extra observations, reordered IDs,
and observations bound to the wrong stdin before publication. Strings are plain UTF-8; JSON escapes represent newlines. Observations use the
same shape and order, with actual outputs. Complete array equality determines
the computed `verification-outcome` state. No author supplies an outcome or a
second factual prose summary. A mismatch requires the author to diagnose
`correction_target` as `requirements` or `implementation`; a match requires
`none`. An execution evidence reference preserves the harness capture.

The harness runs the product and captures observations. MDLM validates submitted
observations and their exact references; it does not authenticate that a command
ran. The independent implementation Review must inspect the capture and source
identity. This limit is explicit, and a generic execution service is outside
this package change.

All submitted data freeze immediately. A failed content Review routes directly
to a same-lineage correction. A wrong expectation revises the `REQ`, receives a
fresh Review, then rebinds the existing `IMP` lineage to the new exact `REQ`.
Unchanged code retains its source commit. A wrong product revises its `IMP`.
Both routes require fresh execution, implementation Review, and stakeholder
acceptance. Prior failures remain inspectable and cannot satisfy the new revision.

Keep product source in a separate Git checkout. Record its exact commit,
executable argv, and file paths in `IMP`. The lifecycle repository HEAD must not
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

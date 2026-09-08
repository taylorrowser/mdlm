# Remove duplicate executable expectations

Issue #730 follows frozen run244 on `2ce5a5840053df8b1045d791f809baa8df343d12`. Docker captured the script correctly, but the separately authored REQ cases contradicted both the requirement commitments and the script. The fix removes that second executable expectation format.

REQ retains title, intent, observable commitments and source. The three requirement-writing completion expressions no longer reference cases. Draft/review prompts, current documentation and fixtures match the smaller schema. The existing script, Docker receipt, result classification, source binding and six-Assignment process remain intact.

Validation on the isolated source worktree:

- Build passed, 3.41 seconds, peak411012KiB.
- Existing public author-scaffold and package tests passed2/2, 3.23 seconds, peak226324KiB. The public test fills the emitted requirements scaffold without cases and publishes it through `assignment submit-proposal`.
- Typecheck passed.
- The existing Docker journey fixture now authors requirements without cases. Docker execution code is unchanged; repeating its full journey is left to release qualification.

The owning development instruction now puts executable expectations exclusively in the committed script. Process learning class9 records removal of duplicate expectation fields after machine capture moves to the CLI. No old lane or release was changed. Run244 remains frozen without acceptance; run243 is frozen and run242 complete. The separate late stakeholder-rejection route limitation remains outside this deletion.

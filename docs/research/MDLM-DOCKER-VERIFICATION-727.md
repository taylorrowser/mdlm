# Docker verification, issue 727

The tiny process now keeps the verification script with the product in its exact committed source. IMP records the source repository, commit, pinned image, script path and command argv. `mdlm assignment run --json` executes that bundle in a disposable Docker container. The existing verification Assignment remains; the package still has one requirement level and six normal Assignments.

The script owns assertions. Exit 0 is pass, exit 1 is assertion failure, and other statuses are error. The CLI captures stdout and stderr bytes as base64 and displays derived UTF-8 text. It records the resolved source tree, script digest, image identity, command, execution phase and actual exit status. Source or setup errors retain absent identities as null. Agents assess the captured result and choose a correction target; they cannot supply RES outcome or receipt through either author values or full response submission.

Receipts are Git blobs retained under per-Assignment attempt refs. An attempt marker precedes Docker execution. Repeating the command returns a completed receipt; explicit `--retry` is allowed before script execution and preserves the earlier attempt. A pending interrupted marker requires explicit retry rather than an automatic second execution. Canonical publication checks the exact receipt binding and source, then fills the protected fields. Direct datum creation also retains the kernel-managed field prohibition. Every completed error can enter ordinary implementation correction; agents decide whether environment repair and an explicit retry are appropriate.

The Docker module uses a clean Git archive mounted read-only at `/workspace`, a read-only root filesystem, writable temporary space, an unprivileged user, no network, no added host environment, and no Docker socket mount. Scripts have a 60-second default timeout and capture is bounded at 16 MiB. Container cleanup runs on every attempted setup/execution path. The image must already be available or be pullable by Docker; Docker installation and permissions are host prerequisites.

## Validation

The public CLI Docker journey passed in 38.77 seconds, peak 143820 KiB. It preserves an assertion failure caused by literal backslash-n expectations, an exit-2 execution error, and a corrected passing script that checks stdin and argv behavior. It verifies repeat invocation returns the same receipt, missing execution cannot publish, authored outcome and forged full response cannot pass, and fail/error cannot claim no correction. The final acceptance references the passing RES. Judgments in this regression are scripted; it is not an autonomous model reliability run.

The final source-preflight refinement was added after that public journey. Its focused receipt test and package load passed together in 1.07 seconds, peak 233784 KiB. The test proves a source that cannot execute produces an honest error with null identities, may enter correction, reuses its receipt ordinarily, and preserves both attempts on explicit retry. Final build passed in 3.00 seconds, peak 411148 KiB. Typecheck also passed. Qualification and the installed journey remain release work.

The first public test attempt failed on the test's expectation that an author-value compilation rejection included a submission outcome. The CLI correctly returned `ok: false`; the test now asserts that contract. Its initial unconditional temporary cleanup was also replaced with symmetric outcome capture and preservation before the successful attempt.

Durable evidence is `/home/ubuntu/git/mdlm-successor-demos/operations/integration/docker-verification-727/`: `public-journey-outcome.json`, copied source and lifecycle repositories, and `file-digests.json`. The receipt's original source paths remain provenance, not permission to replay the completed Assignment.

## Remaining limits

An independent content review must still decide whether the script assertions establish the stakeholder requirements. A script that simply exits zero is mechanically successful and substantively inadequate. The existing implementation/evidence Review owns this check. Custom Docker builds and additional environment records are outside this change. The separate stakeholder-rejection route gap discovered in run243 is unchanged; its frozen history is preserved.

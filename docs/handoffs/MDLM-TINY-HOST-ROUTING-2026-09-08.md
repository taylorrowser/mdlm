# Tiny-process host instruction routing

Issue #720 under #717 corrected the non-Git host file
`/home/ubuntu/git/mdlm-orchestration/AGENTS.md` on September 8, 2026. It now reads
development and tracker guidance from the exact assigned MDLM worktree or release
candidate. The shared `/home/ubuntu/git/mdlm` checkout is explicitly
non-authoritative and had supplied stale instructions.

The edit also replaces the historical full-V scale pointer with tiny-product
accepted-delivery and recovery measures. It preserves exact lane identities,
no-replay rules, manager tenure, and the durable improvement loop. No
`OPERATING-POLICY.md` bytes or lane records changed.

The [exact patch](MDLM-TINY-HOST-ROUTING-2026-09-08.patch) applies in
`/home/ubuntu/git/mdlm-orchestration` with `patch -p1`. To restore the prior text,
use `patch -R -p1` only after checking for intervening edits. Verify the file with
`sha256sum AGENTS.md`.

- Before SHA-256: `81180917b9c801f96448bfc7a56d71b49c33994273cd8e3b611f48bc4945ba00`
- After SHA-256: `7d777d5fed6a09e3ae7d3e643d5410cd050dbd735e6f1b203ed2be319aa1718b`

This is a documentation routing change, not release qualification or demo launch
authority.

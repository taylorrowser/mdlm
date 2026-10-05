# 0.1.0

The kernel now has an independent release version. Earlier kernel artifacts used version0.0.0 and were identified by source commit and digest. Process Package data moved to the separate private mdlm-process-package repository and distribution2.5.23 without changing package bytes or identities.

`npm ci` installs the exact pinned private Git commit and requires GitHub SSH access. Bare initialization continues selecting mdlm-tiny@1.0.1; named exploratory and iterative initialization remain available. `mdlm init DESTINATION --package DIRECTORY` validates and copies an independently installed package directory.

Existing products continue loading their selected local package. Updating the kernel does not select a new package or rewrite accepted history. This extraction adds no loose ends and does not yet authorize package migration. Package distribution release notes describe package adoption support. Required direct/expression/kernel capability contracts are unchanged, and focused installed tests exercise all three package identities against this kernel release.

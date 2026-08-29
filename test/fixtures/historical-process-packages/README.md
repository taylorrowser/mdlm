# Historical Process Package captures

Each archive is one immutable test package named by its exact
`processPackageDigest`. The fixture loader rejects unknown digests, extracts the
selected archive into staging, recomputes the digest, and only then replaces the
repository package.

These five captures preserve the package bytes consumed by the Phase 0 and
Phase 1 lifecycle-data fixtures. They were captured from the last passing
pre-#330 fixture restoration at MDLM commit
`6179132fbbbb4203914c3cd5ce4efcf723219e1a`. Do not refresh them when the current
Example Process Package changes. Current-package fixture generation is a
separate mechanism.

---
id: implement-design-set
version: 1
scenario: implement-design-set
---

# Implement one exact design set

Implement the supplied exact DES set in the separately bound product repository.
Write only the focused unit tests needed to protect its public behavior. Commit
the result, then publish one `ART(kind: implementation)` with the exact
`git:<40-hex>` commit, controlled public interface, one `implements` link for
every supplied DES Revision, one `realizes-candidate` link, and a bounded mapping
from each DES Revision to its relative implementation paths.

Do not publish source files, symbols, unit-test results, build logs, or progress
records as Lifecycle Data. Do not use a mutable branch or tag as the build
reference.

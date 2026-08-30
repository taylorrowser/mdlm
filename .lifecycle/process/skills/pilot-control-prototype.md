---
id: pilot-control-prototype
version: 1
---

# Pilot control prototype

Start from one exact reviewed pilot VER. Create the smallest inline runnable
control pair that answers one question: does this VER pass known-good behavior
and fail one intentionally bad behavior? Use opaque ordered argv tokens, exact
observations, and one bounded fault in the bad control. Do not create product
source, a repository commit, a test suite, or a reusable framework. Use a bare
`PATH`-resolved executable name in argv position zero. Do not embed an absolute
or relative host path.

---
id: verification-activity-implementation
version: 1
---

# Verification activity implementation

- Implement the reviewed VER without changing its acceptance boundary.
- Record exact implementation, environment, target, and activity bindings.
- For pilot and formal work, use no product source, unit tests, private functions, or implementation notes.
- Exercise only public controlled interfaces and data.
- Declare both supported and intentionally unsupported target behavior for discrimination.
- Bind exact normal, raw-malformed, omitted-argument, and extra-argument cases without conflating omission with an empty token or deduplicating ordered tokens.
- Bound checkout, environment checks, and each product case for infrastructure safety; forcibly terminate and reap timeouts while retaining partial raw observation.
- Guarantee cleanup and continue through all cases before aggregating observations.

---
id: create-system-level-candidate
version: 2
scenario: create-system-level-candidate
---

# Create one system-level candidate

Publish one frozen `level-candidate` BSL for the exact reviewed DWP completion.
The Assignment intentionally supplies that completion, its current reachable SYS
outputs, the architecture, interfaces, system-level verification strategy, and
exact simplification Reviews. Its definition members contain exactly the
completion, those SYS outputs, architecture, interfaces, and strategy. Its
evidence contains exactly the supplied passing
`simplification-architecture-interfaces` Review set. Never substitute a planning
DWP `simplification-product-definition` Review. Use the completion Revision as
`scope`, use `DEFAULT` as `group`, and add no historical Revisions or outgoing
links.

Representative system ENV, qualification or pilot VER/VAI, RUN, RES, and their
Reviews are intentionally not candidate-creation inputs. Those evidence
obligations run after candidate creation and its Review.
`candidate-gate-signoff@3` remains blocked until the suitable representative
pilot contract is satisfied.

Before proposing authored Lifecycle Data, apply the bounded ephemeral
`skills/author-preflight.md@2` contract.

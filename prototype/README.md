# River promotion experiment

Open `promotion.html` directly in a browser. It is a self-contained, in-memory experiment. No server or MDLM installation is needed. Download the experiment record to retain a session; reset, reload, switching strategy or choosing a walkthrough clears the current in-memory session.

Question: can selective commitment preserve necessary stakeholder outcomes, optional design provenance and exact history without treating all prototype choices as requirements?

Two entry points share the same fresh requirement model: drafting from a selected design choice and drafting from stakeholder need. The page deliberately exposes the difference in their initial wording. It does not measure which prompt makes an agent write better requirements. Independent authoring experiments are needed for that comparison.

The six guided cases cover solution detail, partial requirement commitment, a new derived obligation without design predecessor, evidence scope on revision, no decision and retirement. The free-play controls allow other orderings. Simulated stakeholder decisions do not represent actual user acceptance. Illustrative checks are explicit separate actions and never claim real product execution.

Prototype boundaries:

- Requirements are flat examples with stakeholder need IDs, not a validated decomposition graph.
- Only correction has a revision/retirement control. This is enough to exercise the selected history question, not a general editor.
- Optional provenance is represented as arrays but the page does not provide arbitrary many-to-many editing.
- A selected requirement baseline is not formal acceptance of a source artifact. No code coverage, verifier or review contract is implemented.
- Current MDLM packages are pinned. The page implements no package replacement, cross-repository exact links or actual promotion route.
- Same-item type-changing promotion is discussed but not implemented. The current kernel requires same-type predecessors, so that strategy would need a separate contract change.
- Numbered correction menus and Python are invented provisional design examples. Correction lookback depth remains unsettled by the supplied stakeholder discussion.
- The revision walkthrough proposes narrowing timing to before game finish as a clearly labeled discussion fixture. It is not an approved interpretation of the user's desired correction scope.

The pure `PromotionModel` block can be exercised without the DOM. The page prints readable full state, exact history details and full JSON. Its purpose is to expose model mistakes, not establish production correctness. No prototype test suite is added.

Supporting case definitions and independent exercise observations are maintained by the parent run in `/home/ubuntu/git/mdlm-successor-demos/operations/promotion-prototype-20260914/`. These documents distinguish scenario expectations from actual observations.

This work stays on throwaway branch `prototype/promotion-20260914`, based on MDLM main `69cce44847db0ba42075ec439d9ab1488b97f37f`. No production decision is implemented by this branch.

## Observed corrections during first exercise

The first page revision attached a synthetic check when a demonstration stakeholder approved a requirement. Although labeled synthetic, this incorrectly coupled commitment with evidence creation. The page now has a separate explicit illustrative-check action. A revision without its own check shows that absence, and old checks retain their exact targets.

The independent exercise found that a requirement without a design predecessor had an empty reason only in the choice-start approach. That accidental asymmetry prevented its guided approval. Both approaches now use the same necessity explanation when there is no prior choice. This is a prototype defect, not evidence that choice-start promotion cannot discover new requirements.

Unsaved free-play wording could be replaced when switching drafts. The page now saves changed draft fields to history before other actions and approves the visible wording. Reset, strategy change and walkthrough change still clear the session as disclosed above.

These observations support separating requirement commitment, evidence attachment and implementation acceptance. They do not establish which drafting prompt works best, or production readiness of promotion.

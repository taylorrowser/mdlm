---
id: source-trace
version: 4
---

# Attribute the committed source through ordinary requirement links

Start from the reviewed RQS in guidance.context and follow its contains and decomposition links with `mdlm show <exact-revision> --json` to read the complete selected REQs and DCPs. Source annotations name its published stable REQ IDs; the CLI resolves those IDs only against the selected exact revisions. Production code implements software leaves. Verification code verifies leaves and may also name upper-level contracts. Verification setup, fixtures and assertion helpers contribute to their linked contract; they do not each prove it independently.

Declare file_roles honestly for every tracked entry, including empty files. In formal scope, production, verification and build files must be Python `.py` source; documentation must be nonexecutable prose. The current Python trace path rejects every formal configuration file, including `.gitignore`. For optional local Git ignore rules, use `.git/info/exclude` outside the tracked snapshot. If the formal product needs configuration, report the unsupported treatment instead of relabeling it as documentation. Provisional files outside formal_files retain their declared roles in the complete inventory; that inventory does not make them formally supported or accepted. The CLI derives product_files, source_inventory, physical ranges and SCP datums from the committed source. Unsupported executable formats, generated code and vendored code need explicit supported treatment before claiming complete coverage.

Put every nonblank Python line in the formal scope inside an explicit closed, nonnested named region. Imports, comments, docstrings and support code count as content. Region names are unique within each file. Blank or whitespace-only lines outside regions are exempt; delimiters and blanks inside a region belong to that region. File-default directives are rejected. Use `python3 product.py` invocation without a shebang outside the regions.

Regions and requirements have a many-to-many relationship. A region can contribute to several requirements, and a requirement can be implemented by several regions across files. In this packing example, assume three selected software leaves: REQ-0000000001 requires marking and clearing an item's checked state; REQ-0000000002 requires readiness to reflect whether all items are checked after either operation; REQ-0000000003 requires rejecting unknown item names. Replace the example IDs with published IDs from the exact guidance.

```python
# mdlm:begin item-validation implements REQ-0000000003
def validate_item(checked, item):
    if item not in checked:
        raise ValueError("Unknown item")
# mdlm:end item-validation

# mdlm:begin item-transition implements REQ-0000000001 REQ-0000000002
def set_checked(checked, item, packed):
    checked[item] = packed
# mdlm:end item-transition

# mdlm:begin readiness-output implements REQ-0000000002
def show_readiness(checked):
    print("Ready" if all(checked.values()) else "Not ready")
# mdlm:end readiness-output
```

The caller validates the item, sets its checked state to true for mark or false for clear, then displays readiness. The state writer owns both the requested transition and the state that makes readiness accurate after it. The renderer owns the readiness calculation and output. Linking readiness only to the renderer would miss the writer when inspecting that requirement's implementation. The validation region only rejects unknown names; it neither changes checked state nor calculates readiness, so it has no readiness link. Calling these regions in one operation does not give them identical responsibilities.

Verifier annotations use verifies. Every region needs at least one selected software leaf with ancestry to a stakeholder root. Choose boundaries around distinct responsibilities. Authors and reviewers check links in both directions: every region has requirements explaining its responsibility, and every software leaf links all regions directly contributing to its observable contract. Include shared loading, validation, state updates and output construction where they contribute to that contract. A function call alone does not make every utility responsible for every caller requirement. Judge the code's actual responsibility; use many-to-many links where responsibilities overlap. A giant region linked to every requirement can pass coverage and still fail content review. Authors maintain boundaries, names, requirement IDs and file roles; the CLI computes all line ranges.

Normal IMP submission generates SCPs atomically from the complete committed snapshot. Each scope belongs-to the exact IMP and implements or verifies exact REQs through ordinary links. Corrections recompute scopes; prior links are not accumulated into new evidence. Review the generated decomposition and region links for meaningful responsibility boundaries. The Docker receipt separately records actual execution and pass/fail.

For an approved requirement change, identify the changed commitments and the explicit preserved commitments. Query their exact selected requirements and inspect the combined directly linked production and verifier regions. Capture the predicted inspection set before editing using the existing prediction record. A missing region that directly contributes to a queried contract is an attribution defect. Code inspected only to check a broader invariant can remain linked to the requirement owning that invariant. Inspect unchanged affected code as well as changed code. Reaffirm the relevant graph explicitly, then submit source against its reviewed selection and run verification. Record what the prediction missed or attributed too broadly. An inspection set identifies work to consider, not lines that necessarily require edits.

Use `mdlm trace why path/to/file.py:LINE --implementation <exact-IMP>` for the effective scope and ancestry of a line. Use `mdlm trace impact <REQ> --implementation <exact-IMP>` for directly linked production/verifier regions of the requested requirement and its descendants, with shared-scope reasons. Other dependencies may need inspection. These are derived read-only views of the ordinary links.

When a proposal includes `impact_dispositions`, run `mdlm review context <action> <exact-subject> --json` for the action and subject from guidance. Select the `requirementGraphs[]` entry whose `selection` equals the revised RQS in guidance inputs. Use precisely that graph's `assessment.sourceScopes` for `impact_dispositions[].source_scope`, once each. Do not choose the first graph or copy the broader inspection set. Required targets can include unchanged code linked to changed claims. Judge each disposition and rationale; supply a candidate mapping when the source coordinate changes.

## Partial acceptance in one source repository

For a limited formal claim, set IMP acceptance_scope to partial and formal_files to the exact committed paths covered by that claim. Include the verifier and every local file needed by the selected behavior. The complete source_inventory still includes every tracked file with its role, blob and formal flag. Every selected source line needs normal attribution. Files outside formal_files are provisional and are visible in review context; they do not become accepted through proximity to a formal module.

Canonical verification removes provisional files from its read-only source snapshot. Exercise the selected behavior so an omitted dependency causes a failed execution. This is execution evidence, not automatic discovery of all possible dependencies. Review the entire visible inventory and judge whether the selected module, tests and claimed scope are sufficient. Do not put whole-product obligations into a partial claim whose supporting code is provisional.

Omit acceptance_scope and formal_files, or set acceptance_scope to whole-product and omit formal_files, for full coverage. An acceptance always names an exact IMP and source commit. Changing provisional code creates a new source identity; the prior acceptance remains historical and does not accept that new commit. Publish a new TRY for provisional use or take the approved-change route for a new IMP. Expanding the formal boundary requires reviewed requirements, full new source attribution, canonical verification and fresh acceptance.

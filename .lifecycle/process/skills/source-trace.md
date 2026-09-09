---
id: source-trace
version: 1
---

# Attribute the committed source through ordinary requirement links

Use the complete reviewed requirement graph supplied by the Assignment. Source annotations name its published stable REQ IDs; the CLI resolves those IDs only against the selected exact revisions. Production code implements software leaves. Verification code verifies leaves and may also name upper-level contracts. Verification setup, fixtures and assertion helpers contribute to their linked contract; they do not each prove it independently.

Declare file_roles for every tracked entry, using production, verification, documentation, build or configuration. The CLI derives product_files, source_inventory, physical ranges and SCP datums from the committed source. Include empty files in the inventory. Classify code honestly; documentation is a role to review, not an escape from attribution. The initial source format is Python comments. Unsupported executable formats, generated code and vendored code need explicit supported treatment before claiming complete coverage.

Put every nonblank Python line inside an explicit closed, nonnested named region. Imports, comments, docstrings and support code count as content. Region names are unique within each file. Blank or whitespace-only lines outside regions are exempt; delimiters and blanks inside a region belong to that region. File-default directives are rejected. Use `python3 product.py` invocation without a shebang outside the regions.

Regions and requirements have a many-to-many relationship. A region can contribute to several requirements, and a requirement can be implemented by several regions across files. Replace these example IDs with published IDs from the Assignment:

```python
# mdlm:begin storage-support implements REQ-0000000001 REQ-0000000002
import json
# mdlm:end storage-support

# mdlm:begin load-store implements REQ-0000000002
def load_store(path):
    ...
# mdlm:end load-store
```

Verifier annotations use verifies. Every region needs at least one selected software leaf with ancestry to a stakeholder root. Choose boundaries around distinct responsibilities and links that explain the code, including shared helpers. A giant region linked to every requirement can pass coverage and still fail content review. Authors maintain boundaries, names, requirement IDs and file roles; the CLI computes all line ranges.

Normal IMP submission generates SCPs atomically from the complete committed snapshot. Each scope belongs-to the exact IMP and implements or verifies exact REQs through ordinary links. Corrections recompute scopes; prior links are not accumulated into new evidence. Review the generated decomposition and region links for meaningful responsibility boundaries. The Docker receipt separately records actual execution and pass/fail.

For an approved requirement change, capture the predicted production and verifier inspection set before editing. Inspect unchanged affected code as well as changed code. Reaffirm the relevant graph explicitly, then submit source against its reviewed selection and run verification. Record what the prediction missed or attributed too broadly. An inspection set identifies work to consider, not lines that necessarily require edits.

Use `mdlm trace why path/to/file.py:LINE --implementation <exact-IMP>` for the effective scope and ancestry of a line. Use `mdlm trace impact <REQ> --implementation <exact-IMP>` for the directed production/verifier inspection set and shared-scope reasons. These are derived read-only views of the ordinary links.

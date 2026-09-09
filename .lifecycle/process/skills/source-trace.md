---
id: source-trace
version: 1
---

# Attribute the committed source through ordinary requirement links

Use the complete reviewed requirement graph supplied by the Assignment. Source annotations name its published stable REQ IDs; the CLI resolves those IDs only against the selected exact revisions. Production code implements software leaves. Verification code verifies leaves and may also name upper-level contracts. Verification setup, fixtures and assertion helpers contribute to their linked contract; they do not each prove it independently.

Declare file_roles for every tracked entry, using production, verification, documentation, build or configuration. The CLI derives product_files, source_inventory, physical ranges and SCP datums from the committed source. Include empty files in the inventory. Classify code honestly; documentation is a role to review, not an escape from attribution. The initial source format is Python comments. Unsupported executable formats, generated code and vendored code need explicit supported treatment before claiming complete coverage.

A file default attributes imports, support code, comments, blank lines and code outside named regions. Use closed nonnested regions when responsibilities differ. Replace these example IDs with published IDs from the Assignment:

```python
# mdlm:file invocation implements REQ-0000000001

# mdlm:begin load-store implements REQ-0000000002 REQ-0000000003
def load_store(path):
    ...
# mdlm:end load-store
```

Verifier annotations use verifies. Every executable file and effective scope needs at least one selected software leaf with ancestry to a stakeholder root. Choose links that explain the code in that scope. A file-wide link to every requirement may pass mechanical coverage and still fail content review. Authors maintain annotations and file roles, not line numbers or a second trace map.

Normal IMP submission generates SCPs atomically from the complete committed snapshot. Each scope belongs-to the exact IMP and implements or verifies exact REQs through ordinary links. Corrections recompute scopes; prior links are not accumulated into new evidence. Review the generated decomposition, scopes, inherited defaults and newly inherited lines. The Docker receipt separately records actual execution and pass/fail.

For an approved requirement change, capture the predicted production and verifier inspection set before editing. Inspect unchanged affected code as well as changed code. Reaffirm the relevant graph explicitly, then submit source against its reviewed selection and run verification. Record what the prediction missed or attributed too broadly. An inspection set identifies work to consider, not lines that necessarily require edits.

Use `mdlm trace why path/to/file.py:LINE --implementation <exact-IMP>` for the effective scope and ancestry of a line. Use `mdlm trace impact <REQ> --implementation <exact-IMP>` for the directed production/verifier inspection set and shared-scope reasons. These are derived read-only views of the ordinary links.

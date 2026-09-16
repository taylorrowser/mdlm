---
id: source-trace
version: 5
skills: []
---

# Attribute production source

Declare file_roles for every committed product entry. Production, build and configuration files are attributed to exact selected software requirements. Documentation is nonexecutable prose. Verification source belongs to its separate VFY repository and is not part of this inventory.

Use source_ranges for language-neutral attribution. Each entry contains path, name, start, end and requirements, a nonempty list of stable requirement IDs. Ranges are inclusive physical line numbers. Give every nonblank supported source line a clear responsibility; several ranges may support one requirement and one range may support several requirements. The CLI binds stable IDs to exact revisions in the selected RQS, checks coverage and generates source inventory and SCP data. Python source may retain supported closed comment regions when source_ranges is omitted. Do not mix representations ambiguously.

Before calculating ranges, inspect numbered source from the exact committed revision.
For example, use `git show <source_commit>:<path> | nl -ba`.
Do not infer line numbers from memory or a working tree that may differ from the commit.

Use meaningful responsibilities instead of one blanket file annotation when the code implements distinct obligations. Review both directions: all necessary code has a requirement, and all implementation obligations have code. This attribution explains the product but is not independent verification evidence. Independent activities link cases to requirements without needing source regions.

For partial acceptance, explicitly name formal_files and acceptance_scope partial. The selected product files must implement the claim exercised by independent verification. Provisional files remain visible in inventory but are not formally accepted. Whole-product acceptance requires the complete supported production inventory. Every new source commit needs its own applicable execution evidence.

For an approved change, use exact selected requirements and generated source scopes to inspect affected responsibilities. Preserve unchanged requirements and explain source impact dispositions. A verification plan can remain unchanged when its public contract and requirements remain valid, but a different product commit still needs fresh execution. Review actual evidence rather than presuming that unchanged code or a historical pass accepts new source.

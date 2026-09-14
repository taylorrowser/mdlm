---
status: superseded by ADR-0007
---

# Derive authority-evidence types from Scenario contracts

MDLM core will derive protected authority-evidence Lifecycle types from the exact selected Process Package's Scenario `authority_evidence.type` contracts. Generic direct creation and Revision creation will reject those types; repository validation will require a matching completed Scenario transaction; validated atomic Scenario execution is their publication path. The kernel will not recognize package-owned Review or Decision type IDs, and packages will not repeat the authority classification in type definitions. This prevents public direct provenance claims, chat text, completion summaries, or a different Scenario's output declaration from publishing evidence that can satisfy consequential authority Policies. As with all Markdown-authoritative lifecycle truth, repository validation is an integrity boundary, not a cryptographic authenticity boundary: an actor with arbitrary filesystem write access can replace both Datum and execution bytes and is outside this contract.

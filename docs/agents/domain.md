# Domain docs

This is a single-context repository. Engineering skills consume its domain documentation as follows.

## Before exploring

Read:

- `CONTEXT.md` at the repository root;
- relevant ADRs under `docs/adr/`;
- the supported operator contract in `README.md` when work touches the Process Package, evaluator, CLI, kernel, or bundled example.

Proceed silently if a referenced domain document does not exist.

## Layout

```text
/
├── CONTEXT.md
├── docs/
│   └── adr/
└── src/
```

## Vocabulary

Use terms from `CONTEXT.md` in issue titles, specifications, implementation plans, tests, and code. Avoid synonyms explicitly rejected by the glossary.

If required terminology is absent, reconsider whether the concept belongs in the model or record the gap through domain modeling.

## Architectural decisions

Read ADRs relevant to the area being changed. If proposed work contradicts an ADR, surface the conflict explicitly rather than silently overriding it.

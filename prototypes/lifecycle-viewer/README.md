# MDLM lifecycle viewer prototype

Throwaway UI prototype for issue #528. It asks whether a public, self-contained
page can help an operator locate a current PSP, STK, or SYS Lifecycle Datum and
explain its direct relations within five minutes.

Generate the trial page from the exact Phase 2 repository and pinned MDLM binary:

```sh
npm run prototype:lifecycle-viewer
```

Then open `prototypes/lifecycle-viewer/trial.html?variant=A` in a browser. The
three structurally different layouts are:

- `?variant=A`: vertical requirement tree;
- `?variant=B`: horizontal trace lanes;
- `?variant=C`: compact requirements ledger.

Use the floating arrows or the keyboard left/right arrows to switch. Select any
node to open its content and all direct incoming and outgoing relations.

Run the artifact smoke check with:

```sh
npm run prototype:lifecycle-viewer:smoke
```

This branch is a primary-source capture of the experiment. Do not promote the
generator or page directly to production.

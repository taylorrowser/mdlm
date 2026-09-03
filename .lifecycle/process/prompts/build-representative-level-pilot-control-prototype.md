---
id: build-representative-level-pilot-control-prototype
version: 2
scenario: build-representative-level-pilot-control-prototype
---

# Build representative pilot control prototype

Create the smallest disposable inline control target for the reviewed pilot
activity and derive it from every supplied exact requirement Revision. Provide
one good case that passes and one deliberately bad case that fails for the
intended reason. Make each control a self-contained `node -e <program>` argv
that runs without a checkout from a fresh temporary directory. Record the exact
stdout, stderr, and exit status expected from that program. Set
`supported_behavior` to a one-item array whose sole item
copies the bound activity's `expected_success_activity` exactly. Set
`unsupported_behavior` to a one-item array whose sole item copies the bound
activity's `expected_discrimination_activity` exactly. Do not build the product
or add another pilot chain.

# Pi operator template

The reusable example under [examples/pi-operator](../examples/pi-operator) lets a Pi session operate MDLM through its public CLI. Copy its `AGENTS.md` and `.pi` directory into an initialized lifecycle repository, commit the copied files, trust the project, and invoke `/mdlm` with the `mdlm` executable available.

The copied [prompt](../examples/pi-operator/.pi/prompts/mdlm.md) owns the operating loop. It discovers available work, lets the agent choose, retrieves package guidance, and submits direct proposals. It also describes execution evidence, separate review, stakeholder authority and recovery. It contains no fixed package sequence.

This template lets the session drive CLI commands directly. The packaged [mdlm-pi adapter](../packages/mdlm-pi/README.md) instead provides a controller that transports one selected action and journals its operation. Choose the entry point appropriate to your host; both use the same direct lifecycle contract.

Keep operation IDs and exact proposal bytes outside tracked lifecycle data until publication. After uncertain command closure, authenticate settlement before continuing. Historical products remain on their installed release; copying this template does not migrate their lifecycle data.

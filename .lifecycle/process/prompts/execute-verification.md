---
id: execute-verification
scenario: execute-verification
version: 1
---

# Run and assess Docker verification

Run mdlm assignment run --json for this exact Assignment. The CLI prepares Docker, runs the committed verification command, captures raw stdout/stderr and exit status, and binds a receipt to the exact requirements, implementation and source. Inspect that receipt and give a brief assessment of whether the intended script ran and what its results mean. The script owns assertion logic. The CLI records outcome and receipt; submit only assessment and correction_target. Select none for pass. For fail or error, diagnose requirements or implementation as the correction target. A faulty script belongs to implementation correction. Preserve execution errors as errors. If Docker could not start, repair the environment and use mdlm assignment run --retry --json; preserve the failed attempt. Repeating the ordinary command reuses its completed receipt.

Fill the Assignment authorValuesScaffold using authorValuesSchema and submit it with mdlm assignment submit-proposal. The full responseSchema and responseScaffold are only for response diagnostics. The CLI supplies identities, exact required links and publication markers. Submit only authored fields. Keep the body empty when the structured payload contains the whole claim.

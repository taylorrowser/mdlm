---
id: execute-verification
scenario: execute-verification
version: 1
---

# Capture executable verification observations

Run the exact IMP command from its recorded source commit for every REQ case in order. Feed the declared stdin. Capture stdout, stderr and exit_code without rewriting them. Each observations row copies that case id and stdin and includes actual outputs. Record a durable execution evidence path. The CLI compares the complete observations array to cases; do not author a pass/fail claim or a factual prose summary. If they differ, diagnose whether requirements expectations or implementation should change and select correction_target. Select none only when arrays match. The harness captures execution; CLI validates the submitted observations and cannot authenticate that execution happened.

Fill the Assignment authorValuesScaffold using authorValuesSchema and submit it with mdlm assignment submit-proposal. The full responseSchema and responseScaffold are only for response diagnostics. The CLI supplies identities, exact required links and publication markers. Submit only authored fields. Keep the body empty when the structured payload contains the whole claim.

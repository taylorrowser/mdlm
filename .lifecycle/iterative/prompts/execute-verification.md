---
id: execute-verification
version: 2
skills: []
---

# Execute an independent activity and record its results

Select one exact VFY linked by verification on this product. Run `mdlm execution run <exact-IMP-or-TRY> <new-operation> --activity <exact-VFY> --json`. The CLI captures the separate committed verifier, product source, pinned environment, all case results and declared evidence files. One script may cover several requirements. Use execution settlement after an uncertain response; never replay an uncertain started operation.

Inspect the actual observations and artifacts. Submit one RES with evaluates pointing to that exact activity and the captured receipt in top-level evidence.receipt. Preserve the fixed product and requirement/experiment links supplied by guidance. The CLI derives outcome, receipt and case_results and supersedes the current earlier result for this exact product/activity. Author assessment and correction_target only. Use none for pass; distinguish implementation, verification or requirements when diagnosing a failure. Skipped cases and execution errors do not pass. Keep failures and interrupted attempts in history.

Run the other selected activities, then inspect `mdlm verification status <exact-product> --json`. Formal verified requires reviewed sufficient coverage for every selected requirement and current passing cases. Provisional criteria report observations without making a baseline claim. An incomplete coverage argument requires a plan revision, not an optimistic assessment of an old receipt.

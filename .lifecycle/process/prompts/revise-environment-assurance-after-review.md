---
id: revise-environment-assurance-after-review
version: 1
scenario: revise-environment-assurance-after-review
skills: [skills/lifecycle-data.md@1, skills/verification-environments.md@1, skills/qualification-verification.md@1, skills/contextual-artifact-review.md@1, skills/reproducibility.md@1]
---

# Correct failed environment assurance

Create the next Revision in the supplied ENV lineage and address every and only the
supplied exact failed Review findings. Link `corrects-review` to every supplied
failed REV. Preserve the exact strategy profile and declared capability boundary;
do not mutate failed history or broaden claims to hide a finding.

Atomically author a new qualification VER and VAI against the replacement ENV.
The qualification design must be capable of exposing the reported defect rather
than reusing or relabeling the failed Revision's evidence. Prior qualification RUN
and RES records remain immutable history but cannot qualify the replacement. The
replacement requires a fresh qualification RUN, exact Review Context, and
independent Review before pilot use.

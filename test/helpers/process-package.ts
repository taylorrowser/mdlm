import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { processPackageDigest } from "../../src/process-package-digest.js";

/** Restore and verify the exact pre-fix package bytes used by immutable fixtures. */
export async function restoreHistoricalFixtureProcessPackage(
  processRoot: string,
  expectedDigest: string,
): Promise<void> {
  const stagingRoot = await fs.mkdtemp(
    path.join(path.dirname(processRoot), ".historical-package-"),
  );
  const stagedPackage = path.join(stagingRoot, "package");
  const preservedPackage = path.join(stagingRoot, "preserved");
  let retainStagingRoot = false;
  try {
    await fs.cp(processRoot, stagedPackage, { recursive: true });

    const issue256SelectorPath = path.join(
      stagedPackage,
      "selectors/pilot-results-completing-run.yaml",
    );
    const issue256Selector = await fs.readFile(issue256SelectorPath, "utf8");
    const preIssue256Selector = issue256Selector.replace(
      'result.payload.assessment_state in ["recorded", "accepted"]',
      'result.payload.assessment_state == "accepted"',
    );
    if (preIssue256Selector === issue256Selector) {
      throw new Error("Historical fixture pilot result assessment selector is absent");
    }
    await fs.writeFile(issue256SelectorPath, preIssue256Selector);

    await fs.rm(path.join(
      stagedPackage,
      "selectors/phase-0-foundation-stable-link-targets.yaml",
    ));
    const issue252ManifestPath = path.join(stagedPackage, "manifest.yaml");
    const issue252Manifest = await fs.readFile(issue252ManifestPath, "utf8");
    await fs.writeFile(
      issue252ManifestPath,
      issue252Manifest.replace(
        "    - phase-0-foundation-stable-link-targets\n",
        "",
      ),
    );
    const issue252ObligationPath = path.join(
      stagedPackage,
      "obligations/intent-candidate-required.yaml",
    );
    const issue252Obligation = await fs.readFile(issue252ObligationPath, "utf8");
    await fs.writeFile(
      issue252ObligationPath,
      issue252Obligation.replace(
        "    stable_link_targets: 'select(\"phase-0-foundation-stable-link-targets@1\", {})'\n",
        "",
      ),
    );
    const issue252ScenarioPath = path.join(
      stagedPackage,
      "scenarios/create-phase-0-intent-candidate.yaml",
    );
    const issue252Scenario = await fs.readFile(issue252ScenarioPath, "utf8");
    await fs.writeFile(
      issue252ScenarioPath,
      issue252Scenario.replace(
        "  - name: stable_link_targets\n" +
          "    types: [QST]\n" +
          "    cardinality: zero-or-more\n" +
          "    identity: revision\n" +
          "    conditions: >-\n" +
          "      !every(\"phase-0-foundation-stable-link-targets@1\", {}, target =>\n" +
          "        target != stable_link_targets)\n",
        "",
      ),
    );
    const issue252PromptPath = path.join(
      stagedPackage,
      "prompts/create-phase-0-intent-candidate.md",
    );
    const issue252Prompt = await fs.readFile(issue252PromptPath, "utf8");
    await fs.writeFile(
      issue252PromptPath,
      issue252Prompt.replace(
        "Copy every and only supplied `member_reviews` Revision into `evidence`; keep that\n" +
          "Review evidence out of `definition_members`. Use supplied `stable_link_targets`\n" +
          "only to confirm the exact Revisions resolved from Stable foundation links; do not\n" +
          "place them in `definition_members` or `evidence`. Do not substitute a Review or\n" +
          "link target, or rely on repository knowledge absent from the Assignment.\n" +
          "\n" +
          "The kernel owns source-byte hashing, Stable-link resolution, exact Process Package\n" +
          "provenance, atomic freeze, and verification. The packet's exact Lifecycle Data\n" +
          "digests expose the bytes the kernel will hash; do not author the kernel-managed\n" +
          "`snapshot`. The candidate itself requires a fresh contextual Review before gate\n" +
          "authorization.\n",
        "Copy every and only supplied `member_reviews` Revision into `evidence`; keep that\n" +
          "Review evidence out of `definition_members`. Do not substitute a Review of another\n" +
          "Revision or rely on repository knowledge absent from the Assignment. Resolve Stable\n" +
          "links, capture hashes and exact Process Package provenance, freeze atomically, and\n" +
          "verify. The candidate itself requires a fresh contextual Review before gate\n" +
          "authorization.\n",
      ),
    );

    const issue229Selectors = [
      "assignment-review-contexts-for-subject",
      "assignment-review-context-members-for-subject",
      "corrections-for-review",
      "superseded-baselines-for-subject",
    ];
    await Promise.all(issue229Selectors.map((selector) =>
      fs.rm(path.join(stagedPackage, `selectors/${selector}.yaml`))
    ));

    // This older package also predates the selector changed by #229 and #234.
    const selectorPath = path.join(
      stagedPackage,
      "selectors/review-assignment-context-members-for.yaml",
    );
    await fs.rm(selectorPath);

    const manifestPath = path.join(stagedPackage, "manifest.yaml");
    const manifest = await fs.readFile(manifestPath, "utf8");
    const preIssue229Manifest = issue229Selectors.reduce(
      (source, selector) => source.replace(`    - ${selector}\n`, ""),
      manifest,
    );
    if (preIssue229Manifest === manifest) {
      throw new Error("Historical fixture correction-lineage selectors are absent");
    }
    const restoredManifest = preIssue229Manifest.replace(
      "    - review-assignment-context-members-for\n",
      "",
    );
    if (restoredManifest === preIssue229Manifest) {
      throw new Error("Historical fixture manifest selector is absent");
    }
    await fs.writeFile(manifestPath, restoredManifest);

    const obligationPath = path.join(
      stagedPackage,
      "obligations/passing-review-required.yaml",
    );
    const obligation = await fs.readFile(obligationPath, "utf8");
    const restoredObligation = obligation.replace(
      "select(\"review-assignment-context-members-for@1\", {subject: subject})",
      "select(\"review-context-members-for@1\", {subject: subject})",
    );
    if (restoredObligation === obligation) {
      throw new Error("Historical fixture Assignment selector is absent");
    }
    await fs.writeFile(obligationPath, restoredObligation);

    const assurancePolicyPath = path.join(
      stagedPackage,
      "policies/phase-1-assurance-correction-participation.yaml",
    );
    const assurancePolicy = await fs.readFile(assurancePolicyPath, "utf8");
    const restoredAssurancePolicy = assurancePolicy
      .replace(
        "description: Keep two Phase 1 assurance correction cycles autonomous, sharing qualification- and Review-driven ENV replacements, then require immediate stakeholder escalation through the same exact Scenario.",
        "description: Keep two Phase 1 assurance Review-correction cycles autonomous, then require immediate stakeholder escalation through the same exact Scenario.",
      )
      .replace(
        "  - priority: 110\n" +
          "    when: >-\n" +
          "      subject.identity.type == \"ENV\"\n" +
          "      && count(\"environment-qualification-correction-history-for@1\",\n" +
          "        {subject: subject}) < 2\n" +
          "      && every(\"failing-reviews-for@1\", {subject: subject}, review =>\n" +
          "        review.payload.correction_authority == \"package-evidence\")\n" +
          "    result:\n" +
          "      authority_mode: autonomous\n" +
          "      authority: package-evidence\n" +
          "      delegation_allowed: false\n" +
          "      attention_timing: none\n" +
          "      attention_checkpoint: null\n" +
          "      consolidation_group: null\n" +
          "  - priority: 100\n" +
          "    when: >-\n" +
          "      subject.identity.type != \"ENV\"\n" +
          "      && count(\"review-correction-history-for@1\",",
        "  - priority: 100\n" +
          "    when: >-\n" +
          "      count(\"review-correction-history-for@1\",",
      );
    if (restoredAssurancePolicy === assurancePolicy) {
      throw new Error("Historical fixture shared ENV correction policy is absent");
    }
    await fs.writeFile(assurancePolicyPath, restoredAssurancePolicy);

    const issue214Files = [
      "obligations/environment-qualification-correction-required.yaml",
      "policies/environment-qualification-correction-participation.yaml",
      "prompts/revise-environment-after-failed-qualification.md",
      "scenarios/revise-environment-after-failed-qualification.yaml",
      "selectors/corrected-environment-qualification-revisions-for.yaml",
      "selectors/environment-qualification-correction-history-for.yaml",
      "selectors/failed-current-environment-qualifications.yaml",
      "selectors/failed-qualification-results-for-environment.yaml",
      "selectors/failed-qualification-results-for-run-and-environment.yaml",
      "selectors/matching-corrected-qualification-result.yaml",
      "selectors/qualification-results-corrected-by-environment.yaml",
      "selectors/unexpected-corrected-qualification-results.yaml",
    ];
    await Promise.all(issue214Files.map((relativePath) =>
      fs.rm(path.join(stagedPackage, relativePath))
    ));

    const phasePath = path.join(stagedPackage, "phases/phase-1-product-assurance.yaml");
    const phase = await fs.readFile(phasePath, "utf8");
    const restoredPhase = phase
      .replace("  - revise-environment-after-failed-qualification@1\n", "")
      .replace("  - environment-qualification-correction-required@1\n", "");
    await fs.writeFile(phasePath, restoredPhase);

    const environmentTypePath = path.join(stagedPackage, "types/ENV.yaml");
    const environmentType = await fs.readFile(environmentTypePath, "utf8");
    const restoredEnvironmentType = environmentType.replace(
      "  - id: corrects-qualification-result\n" +
        "    description: Exact failed qualification results causally addressed by this replacement environment Revision.\n" +
        "    targets:\n" +
        "      - {kind: datum, types: [RES], identity: revision}\n" +
        "    cardinality: {minimum: 0, maximum: many}\n" +
        "    freeze_resolution: already-exact\n" +
        "    inverse_label: corrected-by-environment-revision\n",
      "",
    );
    if (restoredEnvironmentType === environmentType) {
      throw new Error("Historical fixture ENV qualification correction link is absent");
    }
    await fs.writeFile(environmentTypePath, restoredEnvironmentType);

    const issue214ManifestLines = [
      "    - failed-current-environment-qualifications\n",
      "    - failed-qualification-results-for-run-and-environment\n",
      "    - failed-qualification-results-for-environment\n",
      "    - qualification-results-corrected-by-environment\n",
      "    - matching-corrected-qualification-result\n",
      "    - unexpected-corrected-qualification-results\n",
      "    - corrected-environment-qualification-revisions-for\n",
      "    - environment-qualification-correction-history-for\n",
      "    - environment-qualification-correction-required\n",
      "    - revise-environment-after-failed-qualification\n",
      "    - prompts/revise-environment-after-failed-qualification.md@1\n",
    ];
    const currentManifest = await fs.readFile(manifestPath, "utf8");
    const issue214RestoredManifest = issue214ManifestLines.reduce(
      (source, line) => source.replace(line, ""),
      currentManifest,
    ).replace(
      ", environment-qualification-correction-participation",
      "",
    );
    if (issue214RestoredManifest === currentManifest) {
      throw new Error("Historical fixture manifest qualification correction entries are absent");
    }
    await fs.writeFile(manifestPath, issue214RestoredManifest);

    const restoredDigest = await processPackageDigest(stagedPackage);
    if (restoredDigest !== expectedDigest) {
      throw new Error(
        `Restored Process Package digest '${restoredDigest}' does not match '${expectedDigest}'`,
      );
    }

    await fs.rename(processRoot, preservedPackage);
    try {
      await fs.rename(stagedPackage, processRoot);
    } catch (installationError) {
      try {
        await fs.rename(preservedPackage, processRoot);
      } catch (rollbackError) {
        retainStagingRoot = true;
        throw new AggregateError(
          [installationError, rollbackError],
          `Historical Process Package installation and rollback failed; preserved package retained at '${preservedPackage}'`,
        );
      }
      throw installationError;
    }
  } finally {
    if (!retainStagingRoot) {
      await fs.rm(stagingRoot, { recursive: true, force: true });
    }
  }
}

export async function ensureFixtureProcessPackage(
  repository: string,
  expected: { reference: string; digest: string },
  fixtureDescription: string,
): Promise<string> {
  const selectionPath = path.join(repository, ".lifecycle/process-selection.json");
  const selection = JSON.parse(await fs.readFile(selectionPath, "utf8")) as {
    package?: { reference?: string; digest?: string; path?: string };
  };
  const lifecycleRoot = path.resolve(repository, ".lifecycle");
  const packageRoot = typeof selection.package?.path === "string"
    ? path.resolve(repository, selection.package.path)
    : undefined;
  if (packageRoot && !packageRoot.startsWith(`${lifecycleRoot}${path.sep}`)) {
    throw new Error(`Selected Process Package path escapes .lifecycle for ${fixtureDescription}`);
  }
  if (
    packageRoot &&
    await processPackageDigest(packageRoot) !== selection.package?.digest
  ) {
    throw new Error(`Installed Process Package drift before ${fixtureDescription}`);
  }
  if (
    packageRoot &&
    selection.package?.reference === expected.reference &&
    selection.package.digest !== expected.digest
  ) {
    await restoreHistoricalFixtureProcessPackage(packageRoot, expected.digest);
    selection.package.digest = expected.digest;
    await fs.writeFile(selectionPath, `${JSON.stringify(selection, null, 2)}\n`);
    const descriptorPath = path.join(repository, ".lifecycle/repository.json");
    const descriptor = JSON.parse(await fs.readFile(descriptorPath, "utf8")) as {
      package?: { digest?: string };
    };
    if (descriptor.package) {
      descriptor.package.digest = expected.digest;
      await fs.writeFile(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`);
    }
  }
  if (
    selection.package?.reference !== expected.reference ||
    selection.package.digest !== expected.digest ||
    !packageRoot
  ) {
    throw new Error(`Selected Process Package mismatch for ${fixtureDescription}`);
  }
  if (await processPackageDigest(packageRoot) !== expected.digest) {
    throw new Error(`Installed Process Package digest mismatch for ${fixtureDescription}`);
  }
  return packageRoot;
}

export async function copiedProcessPackage(
  prefix = "mdlm-process-",
): Promise<string> {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const processRoot = path.join(temporaryRoot, "process");
  await fs.cp(path.join(process.cwd(), ".lifecycle/process"), processRoot, {
    recursive: true,
  });
  return processRoot;
}

const phase0FoundationObligations = [
  "initial-wayfinding-map-required",
  "product-specification-required",
  "stakeholder-requirements-required",
  "intent-candidate-required",
  "foundation-review-correction-required",
  "intent-candidate-review-correction-required",
  "gate-signoff-review-correction-required",
];

export async function suppressPhase0FoundationObligations(
  processRoot: string,
): Promise<void> {
  for (const obligation of phase0FoundationObligations) {
    const obligationPath = path.join(
      processRoot,
      `obligations/${obligation}.yaml`,
    );
    const source = await fs.readFile(obligationPath, "utf8");
    await fs.writeFile(
      obligationPath,
      source.replace(
        "phases: [phase-0-wayfinding]",
        "phases: [phase-1-product-assurance]",
      ),
    );
  }
  const phasePath = path.join(processRoot, "phases/phase-0-wayfinding.yaml");
  let phase = await fs.readFile(phasePath, "utf8");
  for (const obligation of phase0FoundationObligations) {
    phase = phase.replace(`  - ${obligation}@1\n`, "");
  }
  await fs.writeFile(phasePath, phase);
}

export async function distinctProgressionProcessPackage(
  prefix = "mdlm-distinct-progression-",
): Promise<string> {
  const processRoot = await copiedProcessPackage(prefix);
  await suppressPhase0FoundationObligations(processRoot);
  const manifestPath = path.join(processRoot, "manifest.yaml");
  const manifest = await fs.readFile(manifestPath, "utf8");
  await fs.writeFile(
    manifestPath,
    manifest.replace("id: mdlm-bootstrap", "id: mdlm-distinct-progression"),
  );
  const phasePath = path.join(processRoot, "phases/phase-0-wayfinding.yaml");
  const phase = await fs.readFile(phasePath, "utf8");
  await fs.writeFile(
    phasePath,
    phase.replace(
      /    condition: >-[\s\S]*?    policy_ref: phase-progression-participation@1/,
      `    condition: >-\n      every("candidate-baselines-of-kind@1",\n        {baseline_kind: "intent-level-candidate"}, candidate =>\n          exists("applicable-disposition-decisions-for@1",\n            {subject: candidate, decision_kind: "scope"}))\n    policy_ref: phase-progression-participation@1`,
    ).replace(
      "    scenario: record-gate-signoff@3\n    subjects:",
      "    scenario: record-consequential-decision@1\n    subjects:",
    ).replace(
      "    evidence_selector: applicable-gate-signoffs-for@1",
      "    evidence_selector: applicable-disposition-decisions-for@1",
    ),
  );
  return processRoot;
}

export async function renamedBaselineProcessPackage(
  prefix = "mdlm-process-",
): Promise<string> {
  const processRoot = await copiedProcessPackage(prefix);
  const replaceInYamlFiles = async (directory: string): Promise<void> => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await replaceInYamlFiles(entryPath);
      else if (entry.name.endsWith(".yaml")) {
        const source = await fs.readFile(entryPath, "utf8");
        await fs.writeFile(entryPath, source.replaceAll("BSL", "SNP"));
      }
    }
  };
  await replaceInYamlFiles(processRoot);
  return processRoot;
}

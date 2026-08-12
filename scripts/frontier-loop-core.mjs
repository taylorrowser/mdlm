function fail(message) {
  throw new Error(message);
}

export function validationHasVerdict(output) {
  return /^VALIDATION:\s*(?:PASS|FAIL)\s*$/im.test(output);
}

export function validationPassed(output) {
  const verdicts = [...output.matchAll(/^VALIDATION:\s*(PASS|FAIL)\s*$/gim)];
  return verdicts.length > 0 && verdicts.at(-1)[1].toUpperCase() === "PASS";
}

export function parsePullRequestNumber(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`Invalid pull request URL: ${value}`);
  }
  const match = url.pathname.match(/^\/[^/]+\/[^/]+\/pull\/(\d+)\/?$/);
  if (!match) fail(`Invalid pull request URL: ${value}`);
  return Number(match[1]);
}

export function failureBaseState(inMemory, persisted) {
  return persisted ?? inMemory;
}

export function panesAreRunning(deadStatuses) {
  return deadStatuses.some((status) => status === "0");
}

export function resumesAtValidation(pendingAction) {
  return ["review", "validation", "failed-validation"].includes(pendingAction?.kind);
}

export function actionProgressed(before, after) {
  return before.head !== after.head || before.worktree !== after.worktree || before.issueActivity !== after.issueActivity;
}

export function validationFailureAction({
  remediationUsed,
  diagnosticEscalations,
  maximumDiagnosticEscalations,
  designEscalations,
  maximumDesignEscalations,
  contractReviews = 0,
  targetedRepairCount = 0,
}) {
  if (!remediationUsed) return "remediate";
  if (diagnosticEscalations < maximumDiagnosticEscalations) return "diagnose";
  if (designEscalations < maximumDesignEscalations) return "simplify";
  if (contractReviews < 1) return "contract-review";
  if (targetedRepairCount < 3) return "targeted-repair";
  return "quarantine";
}

const scheduledFailureActions = new Set([
  "remediation",
  "diagnosis",
  "simplification",
  "contract-review",
  "targeted-repair",
  "quarantine",
]);

export function scheduleFailureAction(state, {
  maximumDiagnosticEscalations = 1,
  maximumDesignEscalations = 1,
} = {}) {
  if (scheduledFailureActions.has(state.pendingAction?.kind)) return state;
  const action = validationFailureAction({
    ...state,
    maximumDiagnosticEscalations,
    maximumDesignEscalations,
  });
  if (action === "remediate") {
    return { ...state, remediationUsed: true, pendingAction: { kind: "remediation" } };
  }
  if (action === "diagnose") {
    return {
      ...state,
      diagnosticEscalations: (state.diagnosticEscalations ?? 0) + 1,
      pendingAction: { kind: "diagnosis" },
    };
  }
  if (action === "simplify") {
    return {
      ...state,
      designEscalations: (state.designEscalations ?? 0) + 1,
      pendingAction: { kind: "simplification" },
    };
  }
  if (action === "contract-review") {
    return {
      ...state,
      contractReviews: (state.contractReviews ?? 0) + 1,
      pendingAction: { kind: "contract-review" },
    };
  }
  const evidence = {
    evidencePath: state.failureEvidencePath,
    failureFingerprint: state.currentFailureFingerprint,
    failureRepeated: (state.failureRepeatCount ?? 0) > 0,
  };
  if (action === "targeted-repair") {
    return {
      ...state,
      targetedRepairCount: (state.targetedRepairCount ?? 0) + 1,
      pendingAction: { kind: "targeted-repair", ...evidence },
    };
  }
  return { ...state, pendingAction: { kind: "quarantine", ...evidence } };
}

export function migrateFrontierState(state) {
  if ((state.schemaVersion ?? 0) >= 4) return state;
  const repeatedLegacyContractReview = (state.contractReviews ?? 0) > 1
    && !["validation", "failed-validation", "review", "targeted-repair", "quarantine"].includes(state.pendingAction?.kind);
  return {
    ...state,
    schemaVersion: 4,
    pendingAction: repeatedLegacyContractReview ? { kind: "validation" } : state.pendingAction,
    targetedRepairCount: state.targetedRepairCount ?? 0,
    quarantines: state.quarantines ?? [],
  };
}

export function failureEvidenceMatches(state, identity) {
  return Boolean(state.failureEvidencePath) && state.failureEvidenceIdentity === identity;
}

export function reviewedVerdictAt(state, head, evidenceFingerprint) {
  if (state.reviewedHead !== head || state.reviewedEvidenceFingerprint !== evidenceFingerprint) return null;
  if (typeof state.reviewedPassed !== "boolean" || typeof state.reviewedSimplify !== "boolean") return null;
  return { passed: state.reviewedPassed, simplify: state.reviewedSimplify };
}

export function publicationReconciliationAllowed(state) {
  return state.pendingAction?.kind !== "quarantine";
}

export function mergedPullRequestMatchesValidatedHead(state, pullRequest) {
  return pullRequest?.state === "MERGED"
    && typeof state.validatedHead === "string"
    && pullRequest.headRefOid === state.validatedHead;
}

export function supervisorRecognizesTerminalPhase(phase) {
  return phase === "complete" || phase === "process-dead-end";
}

export function isPublicationRetryFailure(error) {
  return error instanceof Error && error.name === "PublicationRetryError";
}

export function isRemoteValidationFailure(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /^Remote checks failed for PR #\d+/.test(message);
}

export function isTransientInfrastructureFailure(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /(HTTP (?:408|409|425|429|5\d\d)|bad gateway|gateway timeout|connection (?:reset|refused)|network is unreachable|temporary failure|timed out|something went wrong while executing your query|please try resubmitting)/i.test(message);
}

export function isTransientAgentFailure(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /(fetch failed|ETIMEDOUT|timed out|ECONN(?:RESET|REFUSED)|ENETUNREACH|EAI_AGAIN|socket hang up|connection (?:reset|refused)|network is unreachable|temporary failure|provider.*(?:429|5\d\d)|rate limit|bad gateway|gateway timeout)/i.test(message);
}

export function reviewerVerdict(output) {
  const lines = String(output).trimEnd().split(/\r?\n/);
  const complexityLines = lines.filter((line) => /^COMPLEXITY:\s*(?:OK|ESCALATE)\s*$/i.test(line));
  const validationLines = lines.filter((line) => /^VALIDATION:\s*(?:PASS|FAIL)\s*$/i.test(line));
  if (complexityLines.length !== 1 || validationLines.length !== 1 || lines.length < 2) return null;
  const complexity = lines.at(-2).match(/^COMPLEXITY:\s*(OK|ESCALATE)\s*$/i)?.[1]?.toUpperCase();
  const validation = lines.at(-1).match(/^VALIDATION:\s*(PASS|FAIL)\s*$/i)?.[1]?.toUpperCase();
  return complexity && validation ? { complexity, validation } : null;
}

export function reviewHasComplexityVerdict(output) {
  return reviewerVerdict(output) !== null;
}

export function reviewRequestsSimplification(output) {
  return reviewerVerdict(output)?.complexity === "ESCALATE";
}

export function complexityReasonsFromStats(
  { changedFiles, changedLines, lifecycleModules },
  { maximumChangedFiles, maximumChangedLines, maximumLifecycleModules },
) {
  const reasons = [];
  if (changedFiles > maximumChangedFiles) reasons.push(`${changedFiles} changed files exceeds ${maximumChangedFiles}`);
  if (changedLines > maximumChangedLines) reasons.push(`${changedLines} changed lines exceeds ${maximumChangedLines}`);
  if (lifecycleModules > maximumLifecycleModules) reasons.push(`${lifecycleModules} lifecycle modules exceeds ${maximumLifecycleModules}`);
  return reasons;
}

export function validatedHeadMatches(state, head) {
  return typeof state?.validatedHead === "string" && state.validatedHead === head;
}

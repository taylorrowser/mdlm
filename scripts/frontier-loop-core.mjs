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

export function validationFailureAction({
  remediationUsed,
  diagnosticEscalations,
  maximumDiagnosticEscalations,
  designEscalations,
  maximumDesignEscalations,
}) {
  if (!remediationUsed) return "remediate";
  if (diagnosticEscalations < maximumDiagnosticEscalations) return "diagnose";
  if (designEscalations < maximumDesignEscalations) return "simplify";
  return "contract-review";
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

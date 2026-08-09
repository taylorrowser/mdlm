function fail(message) {
  throw new Error(message);
}

function readyForSerialWork(issue) {
  return issue.state === "OPEN"
    && issue.assignees.length === 0
    && issue.blockedBy.every((blocker) => blocker.state === "CLOSED");
}

export function findFrontier(issues) {
  return [...issues].sort((left, right) => left.number - right.number).find(readyForSerialWork);
}

export function findBacklogItem(issues) {
  return [...issues].sort((left, right) => left.number - right.number).find(readyForSerialWork);
}

export function selectOlderReadyBacklog(parent, summaries, children) {
  const childNumbers = new Set(children.map((issue) => issue.number));
  return summaries
    .filter((issue) => issue.number < parent && !childNumbers.has(issue.number))
    .filter((issue) => issue.state === "OPEN" && issue.labels?.some((label) => label.name === "ready-for-agent"));
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
  attempt,
  maximumAttempts,
  diagnosticEscalations,
  maximumDiagnosticEscalations,
  designEscalations,
  maximumDesignEscalations,
}) {
  if (attempt < maximumAttempts) return "remediate";
  if (diagnosticEscalations < maximumDiagnosticEscalations) return "diagnose";
  if (designEscalations < maximumDesignEscalations) return "simplify";
  return "contract-review";
}

export function shouldDiagnoseResume(state) {
  return state?.resumeAction === "diagnose";
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
  return /(fetch failed|ECONN(?:RESET|REFUSED)|ENETUNREACH|EAI_AGAIN|socket hang up|connection (?:reset|refused)|network is unreachable|temporary failure|provider.*(?:429|5\d\d)|rate limit|bad gateway|gateway timeout)/i.test(message);
}

export function reviewHasComplexityVerdict(output) {
  return /^COMPLEXITY:\s*(?:OK|ESCALATE)\s*$/im.test(output);
}

export function reviewRequestsSimplification(output) {
  const verdicts = [...output.matchAll(/^COMPLEXITY:\s*(OK|ESCALATE)\s*$/gim)];
  return verdicts.length > 0 && verdicts.at(-1)[1].toUpperCase() === "ESCALATE";
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

export function parentSection(body) {
  const text = String(body ?? "");
  const marker = /^## Parent\s*$/m.exec(text);
  if (!marker) return "";
  const remainder = text.slice(marker.index + marker[0].length);
  const nextHeading = remainder.search(/^## /m);
  return nextHeading === -1 ? remainder : remainder.slice(0, nextHeading);
}

export function bodyReferencesParent(body, parent) {
  return new RegExp(`(?:/issues/|#)${parent}(?:\\D|$)`).test(parentSection(body));
}

export function referencedParentNumber(body) {
  const match = parentSection(body).match(/(?:\/issues\/|#)(\d+)(?:\D|$)/);
  return match ? Number(match[1]) : null;
}

export function validatedHeadMatches(state, head) {
  return typeof state?.validatedHead === "string" && state.validatedHead === head;
}

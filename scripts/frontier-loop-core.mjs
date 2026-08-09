function fail(message) {
  throw new Error(message);
}

function readyForSerialWork(issue) {
  return issue.state === "OPEN"
    && issue.assignees.length === 0
    && issue.blockedBy.every((blocker) => blocker.state === "CLOSED");
}

export function findReadyItem(issues) {
  return [...issues].sort((left, right) => left.number - right.number).find(readyForSerialWork);
}

export const findFrontier = findReadyItem;

export function normalizeNativeBlockers(value) {
  if (Array.isArray(value)) return value;
  return Array.isArray(value?.nodes) ? value.nodes : [];
}

export function priorityIssueSnapshot(parent, summaries) {
  return summaries
    .filter((issue) => bodyReferencesParent(issue.body, parent))
    .map((issue) => issue.number)
    .sort((left, right) => left - right);
}

export function selectSnapshottedIssues(issueNumbers, summaries) {
  const selected = new Set(issueNumbers);
  return summaries.filter((issue) => selected.has(issue.number));
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

export function blockedBySection(body) {
  const text = String(body ?? "");
  const marker = /^## Blocked by\s*$/m.exec(text);
  if (!marker) return "";
  const remainder = text.slice(marker.index + marker[0].length);
  const nextHeading = remainder.search(/^## /m);
  return nextHeading === -1 ? remainder : remainder.slice(0, nextHeading);
}

export function bodyBlockedByNumbers(body) {
  return [...blockedBySection(body).matchAll(/(?:\/issues\/|#)(\d+)(?=\D|$)/g)].map((match) => Number(match[1]));
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

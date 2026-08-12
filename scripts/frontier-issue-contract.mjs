function readyForSerialWork(issue) {
  return issue.state === "OPEN"
    && issue.assignees.length === 0
    && issue.blockedBy.every((blocker) => blocker.state === "CLOSED");
}

export function findReadyItem(issues, { excludedIssueNumbers = [] } = {}) {
  const excluded = new Set(excludedIssueNumbers);
  return [...issues]
    .sort((left, right) => left.number - right.number)
    .find((issue) => !excluded.has(issue.number) && readyForSerialWork(issue));
}

export const findFrontier = findReadyItem;

export function selectFixedScopeCandidate(priorityIssues, backlogIssues, { excludedIssueNumbers = [] } = {}) {
  const priority = findReadyItem(priorityIssues, { excludedIssueNumbers });
  if (priority) return { issue: priority, scope: "priority-map frontier" };
  const backlog = findReadyItem(backlogIssues, { excludedIssueNumbers });
  return backlog ? { issue: backlog, scope: "older ready backlog" } : { issue: undefined, scope: "fixed delivery scope" };
}

export function fixedIdentitiesAreClosed(issueNumbers, issues) {
  const byNumber = new Map(issues.map((issue) => [issue.number, issue]));
  return issueNumbers.every((number) => byNumber.get(number)?.state === "CLOSED");
}

export function normalizeNativeBlockers(value) {
  if (Array.isArray(value)) return value;
  return Array.isArray(value?.nodes) ? value.nodes : [];
}

function section(body, heading) {
  const text = String(body ?? "");
  const marker = new RegExp(`^## ${heading}\\s*$`, "m").exec(text);
  if (!marker) return "";
  const remainder = text.slice(marker.index + marker[0].length);
  const nextHeading = remainder.search(/^## /m);
  return nextHeading === -1 ? remainder : remainder.slice(0, nextHeading);
}

export function bodyBlockedByNumbers(body) {
  return [...section(body, "Blocked by").matchAll(/(?:\/issues\/|#)(\d+)(?=\D|$)/g)].map((match) => Number(match[1]));
}

export function bodyReferencesParent(body, parent) {
  return new RegExp(`(?:/issues/|#)${parent}(?:\\D|$)`).test(section(body, "Parent"));
}

export function referencedParentNumber(body) {
  const match = section(body, "Parent").match(/(?:\/issues\/|#)(\d+)(?:\D|$)/);
  return match ? Number(match[1]) : null;
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

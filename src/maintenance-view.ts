import type { inspectRequirementTrace } from "./requirement-trace-inspection.js";
import type { verificationStatus } from "./independent-verification.js";

type Impact = ReturnType<typeof inspectRequirementTrace>;
type Status = ReturnType<typeof verificationStatus>;
const shown = (value: unknown): string => value === undefined ? "MISSING" : JSON.stringify(value);
const fields = (value: object, keys: string[]): string => keys.map(key =>
  `${key}=${shown((value as Record<string, unknown>)[key])}`).join(" ");

/** Present existing query results without deriving graph or verification judgments. */
export function renderMaintenanceView(impact: Impact, status: Status): string {
  if (!impact.implementation || !impact.selection || !impact.source_commit ||
      impact.implementation !== status.subject || impact.selection !== status.selection ||
      impact.source_commit !== status.sourceCommit || !impact.resolvedRequirement) {
    throw new Error("Maintenance summary requires matching exact implementation, selection and source identities");
  }
  const titles = new Map(impact.requirements.map(row => [row.revision, row.payload.title]));
  const statuses = new Map(status.requirements.map(row => [row.requirement, row]));
  const requested = impact.resolvedRequirement;
  const relevant = new Set([requested]);
  const lines = [
    "Maintenance summary",
    fields(impact, ["implementation", "selection", "source_commit"]),
    `Requested requirement: ${requested} | ${shown(titles.get(requested))}`,
    "Both queries use the same loaded data; no filesystem transaction is claimed.",
    "Historical passing evidence does not verify a successor.",
    "Shared responsibilities do not mark other requirements changed or authorize deletion.",
    "These recorded checks inform reassessment; successor status and guidance determine required work.",
    "",
    "Recorded source responsibilities:",
  ];
  if (!impact.scopes.length) lines.push("No recorded source responsibilities.");
  for (const scope of impact.scopes) {
    lines.push(fields(scope, ["revision", "path", "name", "ranges", "blob", "source_commit"]));
    lines.push(`  Requested/descendant reasons: ${shown(scope.reasons)}`);
    lines.push(`  Shared responsibilities: ${shown(scope.otherRequirements)}`);
    for (const row of [...scope.reasons, ...scope.otherRequirements]) relevant.add(row.requirement);
  }

  // Deduplicate identical details, never join different requirements by activity or case ID.
  const associations = new Map<string, { reference: string; detail: object }>();
  lines.push("", "Relevant requirement verification:");
  for (const requirement of [...relevant].sort()) {
    const row = statuses.get(requirement);
    lines.push(`${requirement} [${requirement === requested ? "requested" : "related by recorded scope"}] | ${shown(row?.title ?? titles.get(requirement))}`);
    if (!row) {
      lines.push("  Verification: MISSING");
      continue;
    }
    lines.push(`  ${fields(row, ["coverage", "collectiveCoverage", "execution", "currentness", "overall", "nextAction"])}`);
    if (!row.activities?.length) {
      lines.push(`  Activities: ${row.activities ? "none recorded" : "MISSING"}`);
      continue;
    }
    const references = row.activities.map(activity => {
      const detail = {
        activity: activity.activity, adequacy: activity.adequacy, reviews: activity.reviews,
        result: activity.result, resultOutcome: activity.resultOutcome,
        currentness: activity.currentness, reason: activity.reason,
        historicalResults: activity.historicalResults,
        cases: activity.cases?.map(row => ({ id: row.id, outcome: row.outcome })),
      };
      const key = JSON.stringify(detail);
      if (!associations.has(key)) associations.set(key, { reference: `A${associations.size + 1}`, detail });
      return associations.get(key)!.reference;
    });
    lines.push(`  Requirement-specific activity associations: ${references.join(", ")}`);
  }
  lines.push("", "Requirement-specific activity associations (the same activity may appear more than once):");
  if (!associations.size) lines.push("No relevant activities recorded.");
  for (const { reference, detail } of associations.values()) {
    lines.push(`${reference}: ${fields(detail, ["activity", "adequacy", "reviews", "result", "resultOutcome", "currentness", "reason", "historicalResults", "cases"])}`);
  }
  lines.push("", "Selection uncertainty:");
  for (const key of ["diagnostics", "revisionAlternatives", "reassessment", "unselectedCurrentRequirements"] as const) {
    lines.push(`${key}: ${shown(impact[key])}`);
  }
  lines.push("", "Detailed requirement prose, verification methods, actual results and artifacts remain available:",
    `mdlm trace impact ${requested} --implementation ${impact.implementation} --json`,
    `mdlm verification status ${impact.implementation} --json`);
  return lines.join("\n");
}

import { structuralValuesEqual } from "./structural-equality.js";
import type { LifecycleRecord } from "./evaluator.js";

export interface StableLinkResolution {
  link: string;
  stableTarget: string;
  targetRevision: string;
}

export interface DependencyComparison {
  subjectRevision: string;
  beforeRevision: string;
  afterRevision: string;
  beforeStableLinkResolutions?: StableLinkResolution[];
  afterStableLinkResolutions?: StableLinkResolution[];
}

interface DependencyChangeBase {
  record_version: "dependency-change@1";
  subject_revision: string;
  before_revision: string;
  after_revision: string;
}

export interface ContentDependencyChange extends DependencyChangeBase {
  kind: "content-change";
  path: string;
  before_present: boolean;
  after_present: boolean;
  before: unknown;
  after: unknown;
}

export interface OutboundLinkDependencyChange extends DependencyChangeBase {
  kind: "outbound-link-change";
  link_type: string;
  before_targets: string[];
  after_targets: string[];
}

export interface StableLinkResolutionDependencyChange
  extends DependencyChangeBase {
  kind: "stable-link-resolution-change";
  link_type: string;
  stable_target: string;
  before_target_revision: string;
  after_target_revision: string;
}

export type DependencyChangeRecord =
  | ContentDependencyChange
  | OutboundLinkDependencyChange
  | StableLinkResolutionDependencyChange;

export const dependencyChangeExpressionPaths = {
  record_version: "string",
  kind: "string",
  subject_revision: "string",
  before_revision: "string",
  after_revision: "string",
  path: "string",
  before_present: "boolean",
  after_present: "boolean",
  before: "unknown",
  after: "unknown",
  link_type: "string",
  before_targets: "array",
  after_targets: "array",
  stable_target: "string",
  before_target_revision: "string",
  after_target_revision: "string",
} as const;

export interface DependencyComparisonDiagnostic {
  code: "unsupported-dependency-comparison";
  path: string;
  message: string;
}

interface DependencyComparisonResult {
  changes: DependencyChangeRecord[];
  diagnostics: DependencyComparisonDiagnostic[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function changedContentPaths(
  before: unknown,
  after: unknown,
  path: string,
): { path: string; before: unknown; after: unknown }[] {
  if (structuralValuesEqual(before, after)) return [];
  if (isObject(before) && isObject(after)) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .sort()
      .flatMap((key) =>
        changedContentPaths(before[key], after[key], `${path}.${key}`)
      );
  }
  return [{
    path,
    before: before === undefined ? null : before,
    after: after === undefined ? null : after,
  }];
}

function changedPathExists(record: LifecycleRecord, path: string): boolean {
  const segments = path.split(".");
  let current: unknown = record.datum;
  for (const segment of segments) {
    if (!isObject(current) || !Object.hasOwn(current, segment)) return false;
    current = current[segment];
  }
  return true;
}

function targetsByLink(record: LifecycleRecord): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const link of record.datum.links) {
    grouped.set(link.type, [...(grouped.get(link.type) ?? []), link.target]);
  }
  for (const [link, targets] of grouped) {
    grouped.set(link, [...targets].sort());
  }
  return grouped;
}

function resolutionKey(value: StableLinkResolution): string {
  return `${value.link}\u0000${value.stableTarget}`;
}

function resolutionsByLink(
  values: StableLinkResolution[],
): Map<string, string> {
  return new Map(values.map((value) => [resolutionKey(value), value.targetRevision]));
}

function isExactRevision(reference: string): boolean {
  return /-r[0-9]{5}$/.test(reference);
}

function unsupported(
  path: string,
  message: string,
): DependencyComparisonResult {
  return {
    changes: [],
    diagnostics: [{ code: "unsupported-dependency-comparison", path, message }],
  };
}

function compareOne(
  comparison: DependencyComparison,
  index: number,
  records: Map<string, LifecycleRecord>,
): DependencyComparisonResult {
  const comparisonPath = `dependencyComparisons[${index}]`;
  const subject = records.get(comparison.subjectRevision);
  if (!subject) {
    return unsupported(
      `${comparisonPath}.subjectRevision`,
      `Dependency comparison subject references unavailable Revision '${comparison.subjectRevision}'`,
    );
  }
  const before = records.get(comparison.beforeRevision);
  if (!before) {
    return unsupported(
      `${comparisonPath}.beforeRevision`,
      `Dependency comparison references unavailable Revision '${comparison.beforeRevision}'`,
    );
  }
  const after = records.get(comparison.afterRevision);
  if (!after) {
    return unsupported(
      `${comparisonPath}.afterRevision`,
      `Dependency comparison references unavailable Revision '${comparison.afterRevision}'`,
    );
  }
  if (
    before.datum.id !== after.datum.id ||
    before.datum.type !== after.datum.type
  ) {
    return unsupported(
      comparisonPath,
      `Dependency comparison requires exact Revisions from one Stable Datum and type; received '${comparison.beforeRevision}' and '${comparison.afterRevision}'`,
    );
  }

  const common = {
    record_version: "dependency-change@1" as const,
    subject_revision: subject.datum.revision_id,
    before_revision: before.datum.revision_id,
    after_revision: after.datum.revision_id,
  };
  const contentChanges: DependencyChangeRecord[] = [
    ...changedContentPaths(before.datum.payload, after.datum.payload, "payload"),
    ...changedContentPaths(before.datum.body, after.datum.body, "body"),
  ].map((change) => ({
    ...common,
    kind: "content-change" as const,
    before_present: change.before !== null ||
      changedPathExists(before, change.path),
    after_present: change.after !== null || changedPathExists(after, change.path),
    ...change,
  }));

  const beforeLinks = targetsByLink(before);
  const afterLinks = targetsByLink(after);
  const linkTypes = [...new Set([...beforeLinks.keys(), ...afterLinks.keys()])]
    .sort();
  const outboundChanges: DependencyChangeRecord[] = linkTypes.flatMap(
    (linkType) => {
      const beforeTargets = beforeLinks.get(linkType) ?? [];
      const afterTargets = afterLinks.get(linkType) ?? [];
      return structuralValuesEqual(beforeTargets, afterTargets)
        ? []
        : [{
            ...common,
            kind: "outbound-link-change" as const,
            link_type: linkType,
            before_targets: beforeTargets,
            after_targets: afterTargets,
          }];
    },
  );

  const beforeResolutions = comparison.beforeStableLinkResolutions ?? [];
  const afterResolutions = comparison.afterStableLinkResolutions ?? [];
  const beforeResolutionMap = resolutionsByLink(beforeResolutions);
  const afterResolutionMap = resolutionsByLink(afterResolutions);
  const sharedStableLinks = before.datum.links
    .filter((link) =>
      !isExactRevision(link.target) &&
      after.datum.links.some((candidate) =>
        candidate.type === link.type && candidate.target === link.target
      )
    )
    .map((link) => ({ link: link.type, stableTarget: link.target }))
    .sort((left, right) =>
      left.link.localeCompare(right.link) ||
      left.stableTarget.localeCompare(right.stableTarget)
    );
  for (const stableLink of sharedStableLinks) {
    const key = resolutionKey({ ...stableLink, targetRevision: "" });
    if (!beforeResolutionMap.has(key) || !afterResolutionMap.has(key)) {
      return unsupported(
        comparisonPath,
        `Dependency comparison cannot assess stable link '${stableLink.link}' to '${stableLink.stableTarget}' without before and after exact resolutions`,
      );
    }
  }
  const stableResolutionChanges: DependencyChangeRecord[] = sharedStableLinks
    .flatMap(({ link, stableTarget }) => {
      const key = resolutionKey({ link, stableTarget, targetRevision: "" });
      const beforeTargetRevision = beforeResolutionMap.get(key);
      const afterTargetRevision = afterResolutionMap.get(key);
      if (
        beforeTargetRevision === undefined ||
        afterTargetRevision === undefined ||
        beforeTargetRevision === afterTargetRevision
      ) {
        return [];
      }
      return [{
        ...common,
        kind: "stable-link-resolution-change" as const,
        link_type: link,
        stable_target: stableTarget,
        before_target_revision: beforeTargetRevision,
        after_target_revision: afterTargetRevision,
      }];
    });

  return {
    changes: [
      ...contentChanges,
      ...outboundChanges,
      ...stableResolutionChanges,
    ],
    diagnostics: [],
  };
}

export function compareDependencyChanges(
  records: LifecycleRecord[],
  comparisons: DependencyComparison[],
): DependencyComparisonResult {
  const byRevision = new Map(
    records.map((record) => [record.datum.revision_id, record]),
  );
  const changes: DependencyChangeRecord[] = [];
  const diagnostics: DependencyComparisonDiagnostic[] = [];
  const orderedComparisons = comparisons
    .map((comparison, originalIndex) => ({ comparison, originalIndex }))
    .sort((left, right) =>
      left.comparison.subjectRevision.localeCompare(
        right.comparison.subjectRevision,
      ) ||
      left.comparison.beforeRevision.localeCompare(
        right.comparison.beforeRevision,
      ) ||
      left.comparison.afterRevision.localeCompare(
        right.comparison.afterRevision,
      )
    );
  for (const { comparison, originalIndex } of orderedComparisons) {
    const result = compareOne(comparison, originalIndex, byRevision);
    changes.push(...result.changes);
    diagnostics.push(...result.diagnostics);
  }
  return { changes, diagnostics };
}

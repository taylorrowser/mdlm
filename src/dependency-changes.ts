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
  comparisonKind?: "review-context";
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

export interface BaselineMembershipDependencyChange
  extends DependencyChangeBase {
  kind: "baseline-membership-change";
  removed_members: string[];
  added_members: string[];
}

export interface BaselineCompositionDependencyChange
  extends DependencyChangeBase {
  kind: "baseline-composition-change";
  removed_components: string[];
  added_components: string[];
}

export interface EvidenceTargetDependencyChange extends DependencyChangeBase {
  kind: "evidence-target-change";
  removed_evidence: string[];
  added_evidence: string[];
}

export interface ReviewContextDependencyChange extends DependencyChangeBase {
  kind: "review-context-change";
  before_context_revision: string;
  after_context_revision: string;
}

export interface ProcessProvenanceDependencyChange
  extends DependencyChangeBase {
  kind: "process-provenance-change";
  before_process_ref: string;
  after_process_ref: string;
  before_manifest_hash: string;
  after_manifest_hash: string;
  removed_asset_refs: string[];
  added_asset_refs: string[];
}

export type DependencyChangeRecord =
  | ContentDependencyChange
  | OutboundLinkDependencyChange
  | StableLinkResolutionDependencyChange
  | BaselineMembershipDependencyChange
  | BaselineCompositionDependencyChange
  | EvidenceTargetDependencyChange
  | ReviewContextDependencyChange
  | ProcessProvenanceDependencyChange;

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
  removed_members: "array",
  added_members: "array",
  removed_components: "array",
  added_components: "array",
  removed_evidence: "array",
  added_evidence: "array",
  before_context_revision: "string",
  after_context_revision: "string",
  before_process_ref: "string",
  after_process_ref: "string",
  before_manifest_hash: "string",
  after_manifest_hash: "string",
  removed_asset_refs: "array",
  added_asset_refs: "array",
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

interface DependencyComparisonCapabilities {
  exactBaselineType?: string;
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

function payloadContent(
  record: LifecycleRecord,
  capabilityBoundBaseline: boolean,
): Record<string, unknown> {
  if (!capabilityBoundBaseline) return record.datum.payload;
  const {
    definition_members: _members,
    evidence: _evidence,
    snapshot: _snapshot,
    ...content
  } = record.datum.payload;
  return content;
}

function objectValue(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {};
}

function stringValues(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").sort()
    : [];
}

function setDifference(left: string[], right: string[]): string[] {
  const rightValues = new Set(right);
  return left.filter((value) => !rightValues.has(value));
}

function targetsByLink(
  record: LifecycleRecord,
  excludedLink?: string,
): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const link of record.datum.links) {
    if (link.type === excludedLink) continue;
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
  capabilities: DependencyComparisonCapabilities,
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
  const capabilityBoundBaseline =
    capabilities.exactBaselineType !== undefined &&
    before.datum.type === capabilities.exactBaselineType &&
    after.datum.type === capabilities.exactBaselineType;
  if (
    before.datum.type !== after.datum.type ||
    (before.datum.id !== after.datum.id && !capabilityBoundBaseline)
  ) {
    return unsupported(
      comparisonPath,
      `Dependency comparison requires exact Revisions from one Stable Datum and type unless both use exact-baseline@1; received '${comparison.beforeRevision}' and '${comparison.afterRevision}'`,
    );
  }

  if (
    comparison.comparisonKind === "review-context" &&
    !capabilityBoundBaseline
  ) {
    return unsupported(
      `${comparisonPath}.comparisonKind`,
      `Review-context comparison requires Revisions of the type bound to exact-baseline@1`,
    );
  }

  const common = {
    record_version: "dependency-change@1" as const,
    subject_revision: subject.datum.revision_id,
    before_revision: before.datum.revision_id,
    after_revision: after.datum.revision_id,
  };
  const contentChanges: DependencyChangeRecord[] = [
    ...changedContentPaths(
      payloadContent(before, capabilityBoundBaseline),
      payloadContent(after, capabilityBoundBaseline),
      "payload",
    ),
    ...changedContentPaths(before.datum.body, after.datum.body, "body"),
  ].map((change) => ({
    ...common,
    kind: "content-change" as const,
    before_present: change.before !== null ||
      changedPathExists(before, change.path),
    after_present: change.after !== null || changedPathExists(after, change.path),
    ...change,
  }));

  const beforeLinks = targetsByLink(
    before,
    capabilityBoundBaseline ? "composes" : undefined,
  );
  const afterLinks = targetsByLink(
    after,
    capabilityBoundBaseline ? "composes" : undefined,
  );
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

  const beforeMembers = stringValues(before.datum.payload.definition_members);
  const afterMembers = stringValues(after.datum.payload.definition_members);
  const membershipChanges: DependencyChangeRecord[] =
    capabilityBoundBaseline &&
      !structuralValuesEqual(beforeMembers, afterMembers)
      ? [{
          ...common,
          kind: "baseline-membership-change",
          removed_members: setDifference(beforeMembers, afterMembers),
          added_members: setDifference(afterMembers, beforeMembers),
        }]
      : [];
  const beforeComponents = stringValues(
    before.datum.links
      .filter((link) => link.type === "composes")
      .map((link) => link.target),
  );
  const afterComponents = stringValues(
    after.datum.links
      .filter((link) => link.type === "composes")
      .map((link) => link.target),
  );
  const compositionChanges: DependencyChangeRecord[] =
    capabilityBoundBaseline &&
      !structuralValuesEqual(beforeComponents, afterComponents)
      ? [{
          ...common,
          kind: "baseline-composition-change",
          removed_components: setDifference(beforeComponents, afterComponents),
          added_components: setDifference(afterComponents, beforeComponents),
        }]
      : [];
  const beforeEvidence = stringValues(before.datum.payload.evidence);
  const afterEvidence = stringValues(after.datum.payload.evidence);
  const evidenceChanges: DependencyChangeRecord[] =
    capabilityBoundBaseline &&
      !structuralValuesEqual(beforeEvidence, afterEvidence)
      ? [{
          ...common,
          kind: "evidence-target-change",
          removed_evidence: setDifference(beforeEvidence, afterEvidence),
          added_evidence: setDifference(afterEvidence, beforeEvidence),
        }]
      : [];
  const reviewContextChanges: DependencyChangeRecord[] =
    comparison.comparisonKind === "review-context" &&
      before.datum.revision_id !== after.datum.revision_id
      ? [{
          ...common,
          kind: "review-context-change",
          before_context_revision: before.datum.revision_id,
          after_context_revision: after.datum.revision_id,
        }]
      : [];
  const beforeProvenance = objectValue(
    objectValue(before.datum.payload.snapshot).process_provenance,
  );
  const afterProvenance = objectValue(
    objectValue(after.datum.payload.snapshot).process_provenance,
  );
  const beforeProcessRef = typeof beforeProvenance.process_ref === "string"
    ? beforeProvenance.process_ref
    : "";
  const afterProcessRef = typeof afterProvenance.process_ref === "string"
    ? afterProvenance.process_ref
    : "";
  const beforeManifestHash = typeof beforeProvenance.manifest_hash === "string"
    ? beforeProvenance.manifest_hash
    : "";
  const afterManifestHash = typeof afterProvenance.manifest_hash === "string"
    ? afterProvenance.manifest_hash
    : "";
  const beforeAssetRefs = stringValues(beforeProvenance.asset_refs);
  const afterAssetRefs = stringValues(afterProvenance.asset_refs);
  const provenanceChanges: DependencyChangeRecord[] =
    capabilityBoundBaseline && !structuralValuesEqual(
      beforeProvenance,
      afterProvenance,
    )
      ? [{
          ...common,
          kind: "process-provenance-change",
          before_process_ref: beforeProcessRef,
          after_process_ref: afterProcessRef,
          before_manifest_hash: beforeManifestHash,
          after_manifest_hash: afterManifestHash,
          removed_asset_refs: setDifference(beforeAssetRefs, afterAssetRefs),
          added_asset_refs: setDifference(afterAssetRefs, beforeAssetRefs),
        }]
      : [];

  return {
    changes: [
      ...contentChanges,
      ...outboundChanges,
      ...stableResolutionChanges,
      ...membershipChanges,
      ...compositionChanges,
      ...evidenceChanges,
      ...reviewContextChanges,
      ...provenanceChanges,
    ],
    diagnostics: [],
  };
}

export function compareDependencyChanges(
  records: LifecycleRecord[],
  comparisons: DependencyComparison[],
  capabilities: DependencyComparisonCapabilities = {},
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
    const result = compareOne(
      comparison,
      originalIndex,
      byRevision,
      capabilities,
    );
    changes.push(...result.changes);
    diagnostics.push(...result.diagnostics);
  }
  return { changes, diagnostics };
}

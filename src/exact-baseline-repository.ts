import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  evaluateLifecycle,
  resolveType,
  type ArtifactEvaluation,
  type DatumEnvelope,
  type DependencyChangeRecord,
  type DependencyComparison,
  type ProcessDiagnostic,
  type ProcessPackage,
  type ProcessProvenanceDependencyChange,
  type StableLinkResolution,
} from "./index.js";
import {
  createDatum,
  provisionalLifecycleRecord,
  readRepositoryData,
  replaceRepositoryDatum,
  type CreatedDatum,
  type KernelFinalizedScenarioOutput,
  type ParsedDatum,
  type RepositoryResult,
} from "./lifecycle-repository.js";
import { isObligationInstanceIdentity } from "./obligation-instance.js";
import { structuralValuesEqual } from "./structural-equality.js";

export interface BaselineMutation {
  operation:
    | "definition-member-added"
    | "definition-member-removed"
    | "evidence-added"
    | "evidence-removed"
    | "composition-added";
  baselineRevision: string;
  target: string;
}

export interface BaselineFreeze {
  baselineRevision: string;
  frozenAt: string;
  definitionMembers: string[];
  evidence: string[];
  composition: string[];
  hashes: number;
  processRef: string;
}

export interface BaselineVerification {
  baselineRevision: string;
  valid: true;
  definitionMembers: string[];
  evidence: string[];
  composition: string[];
  checkedHashes: number;
  checkedResolutions: number;
}

export interface BaselineDiffSubject extends ArtifactEvaluation {
  subjectRevision: string;
  changes: DependencyChangeRecord[];
}

export interface BaselineDiff {
  beforeBaseline: string;
  afterBaseline: string;
  changes: DependencyChangeRecord[];
  processDrift: ProcessProvenanceDependencyChange[];
  subjects: BaselineDiffSubject[];
}

export interface BaselineRepositoryVerification {
  verifiedBaselines: number;
  processDrift: number;
}

const stableIdentity = /^[A-Z]{3,8}-[0-9A-HJKMNP-TV-Z]{10,12}$/;
const revisionIdentity = /^([A-Z]{3,8}-[0-9A-HJKMNP-TV-Z]{10,12})-r([0-9]{5})$/;

function exactBaselineType(
  processPackage: ProcessPackage,
): RepositoryResult<string> {
  const type = processPackage.kernelCapabilities["exact-baseline@1"]?.type;
  return type
    ? { ok: true, value: type, diagnostics: [] }
    : {
      ok: false,
      diagnostics: [{
        code: "kernel-capability-unavailable",
        path: "exact-baseline@1",
        message: "Selected Process Package does not bind Kernel Capability exact-baseline@1",
      }],
    };
}

function exactBaselineSubject(
  parsed: ParsedDatum[],
  identity: string,
  boundType: string,
  requireEditable: boolean,
): RepositoryResult<ParsedDatum> {
  const candidates = revisionIdentity.test(identity)
    ? parsed.filter((item) => item.lifecycleDatum.datum.revision_id === identity)
    : parsed.filter((item) => item.lifecycleDatum.datum.id === identity)
      .sort((left, right) =>
        right.lifecycleDatum.datum.revision - left.lifecycleDatum.datum.revision
      );
  const selected = candidates[0];
  if (!selected) {
    return {
      ok: false,
      diagnostics: [{
        code: "unknown-baseline",
        path: identity,
        message: `Unknown exact baseline '${identity}'`,
      }],
    };
  }
  if (selected.lifecycleDatum.datum.type !== boundType) {
    return {
      ok: false,
      diagnostics: [{
        code: "baseline-type-mismatch",
        path: identity,
        message: `Lifecycle Datum '${identity}' is not the type '${boundType}' bound to exact-baseline@1`,
      }],
    };
  }
  if (requireEditable && selected.lifecycleDatum.storage.frozen) {
    return {
      ok: false,
      diagnostics: [{
        code: "frozen-revision-immutable",
        path: selected.lifecycleDatum.datum.revision_id,
        message: `Frozen Revision '${selected.lifecycleDatum.datum.revision_id}' cannot be changed`,
      }],
    };
  }
  return { ok: true, value: selected, diagnostics: [] };
}

function exactRevisionList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").sort()
    : [];
}

function compositionRevisions(datum: DatumEnvelope): string[] {
  return datum.links
    .filter((link) => link.type === "composes")
    .map((link) => link.target)
    .sort();
}

function baselineReferenceDiagnostics(
  parsed: ParsedDatum[],
  datum: DatumEnvelope,
  boundType: string,
): ProcessDiagnostic[] {
  const diagnostics: ProcessDiagnostic[] = [];
  const definitions = exactRevisionList(datum.payload.definition_members);
  const evidence = exactRevisionList(datum.payload.evidence);
  const composition = compositionRevisions(datum);
  for (const [section, identities] of [
    ["definition_members", definitions],
    ["evidence", evidence],
  ] as const) {
    for (const identity of identities) {
      if (identity === datum.revision_id) {
        diagnostics.push({
          code: "baseline-self-reference",
          path: identity,
          message: `Exact baseline '${identity}' cannot include itself`,
        });
        continue;
      }
      const target = parsed.find((item) =>
        item.lifecycleDatum.datum.revision_id === identity
      );
      if (!target) {
        diagnostics.push({
          code: "baseline-reference-missing",
          path: identity,
          message: `Baseline ${section} references missing exact Revision '${identity}'`,
        });
      }
    }
  }
  for (const identity of composition) {
    const target = parsed.find((item) =>
      item.lifecycleDatum.datum.revision_id === identity
    );
    if (!target) {
      diagnostics.push({
        code: "baseline-reference-missing",
        path: identity,
        message: `Baseline composition references missing exact Revision '${identity}'`,
      });
    } else if (
      target.lifecycleDatum.datum.type !== boundType ||
      !target.lifecycleDatum.storage.frozen
    ) {
      diagnostics.push({
        code: "baseline-composition-not-frozen",
        path: identity,
        message: `Composed baseline '${identity}' must be a frozen exact Revision of bound type '${boundType}'`,
      });
    }
  }
  return diagnostics;
}

function compositionCycleDiagnostics(
  parsed: ParsedDatum[],
  start: string,
): ProcessDiagnostic[] {
  const byRevision = new Map(parsed.map((item) => [
    item.lifecycleDatum.datum.revision_id,
    item.lifecycleDatum.datum,
  ]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(identity: string): string[] | undefined {
    if (visiting.has(identity)) return [identity];
    if (visited.has(identity)) return undefined;
    visiting.add(identity);
    const datum = byRevision.get(identity);
    for (const target of datum ? compositionRevisions(datum) : []) {
      const cycle = visit(target);
      if (cycle) return [identity, ...cycle];
    }
    visiting.delete(identity);
    visited.add(identity);
    return undefined;
  }
  const cycle = visit(start);
  return cycle
    ? [{
      code: "baseline-composition-cycle",
      path: start,
      message: `Baseline composition cycle: ${cycle.join(" -> ")}`,
    }]
    : [];
}

function exactTargetResolution(
  parsed: ParsedDatum[],
  target: string,
): string | undefined {
  if (revisionIdentity.test(target) || isObligationInstanceIdentity(target)) {
    return target;
  }
  if (!stableIdentity.test(target)) return undefined;
  return parsed
    .filter((item) => item.lifecycleDatum.datum.id === target)
    .sort((left, right) =>
      right.lifecycleDatum.datum.revision - left.lifecycleDatum.datum.revision
    )[0]?.lifecycleDatum.datum.revision_id;
}

function resolvedLinks(
  parsed: ParsedDatum[],
  references: string[],
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const identity of references) {
    const item = parsed.find((candidate) =>
      candidate.lifecycleDatum.datum.revision_id === identity
    );
    if (!item) continue;
    result[identity] = item.lifecycleDatum.datum.links
      .map((link) => exactTargetResolution(parsed, link.target))
      .filter((target): target is string => target !== undefined)
      .sort();
  }
  return result;
}

function frozenResolutionsMatch(
  parsed: ParsedDatum[],
  references: string[],
  stored: Record<string, unknown>,
): boolean {
  if (!structuralValuesEqual(Object.keys(stored).sort(), references.slice().sort())) {
    return false;
  }
  for (const identity of references) {
    const source = parsed.find((item) =>
      item.lifecycleDatum.datum.revision_id === identity
    );
    const targets = stored[identity];
    if (!source || !Array.isArray(targets) ||
      targets.some((target) => typeof target !== "string")) {
      return false;
    }
    const remaining = [...targets] as string[];
    for (const link of source.lifecycleDatum.datum.links) {
      const index = stableIdentity.test(link.target)
        ? remaining.findIndex((target) =>
          revisionIdentity.exec(target)?.[1] === link.target
        )
        : remaining.indexOf(link.target);
      if (index < 0) return false;
      remaining.splice(index, 1);
    }
    if (remaining.length > 0) return false;
  }
  return true;
}

function processAssetRefs(
  processPackage: ProcessPackage,
  data: DatumEnvelope[],
): string[] {
  const refs = new Set<string>();
  const compatibility = processPackage.manifest.compatibility;
  if (typeof compatibility === "object" && compatibility !== null) {
    const value = compatibility as Record<string, unknown>;
    if (typeof value.meta_schema_version === "number") {
      refs.add(`meta-schema@${value.meta_schema_version}`);
    }
    if (typeof value.json_schema_draft === "string") {
      refs.add(`json-schema-draft:${value.json_schema_draft}`);
    }
  }
  const kernelContract = processPackage.manifest.kernel_contract;
  if (typeof kernelContract === "object" && kernelContract !== null) {
    const contract = kernelContract as Record<string, unknown>;
    for (const value of [contract.envelope_schema_id, contract.primitive_catalog_ref]) {
      if (typeof value === "string") refs.add(value);
    }
  }
  for (const datum of data) {
    const type = processPackage.types[datum.type];
    if (type) refs.add(`${datum.type}@${type.version}`);
    const resolved = resolveType(processPackage, datum.type);
    if (resolved.ok) {
      resolved.type.templateChain.forEach((reference) => refs.add(reference));
    }
    for (const value of [
      datum.created_by.process_ref,
      datum.created_by.scenario,
      datum.created_by.prompt_ref,
    ]) {
      if (typeof value === "string") refs.add(value);
    }
    for (const value of [
      datum.created_by.loaded_skill_refs,
      datum.created_by.policy_refs,
    ]) {
      if (!Array.isArray(value)) continue;
      value.forEach((reference) => {
        if (typeof reference === "string") refs.add(reference);
      });
    }
  }
  return [...refs].sort();
}

async function sha256File(filePath: string): Promise<string> {
  return `sha256:${createHash("sha256").update(await fs.readFile(filePath)).digest("hex")}`;
}

export async function createExactBaseline(
  root: string,
  processPackage: ProcessPackage,
  packageReference: string,
  packageDigest: string,
  typeId: string,
  scenarioReference: string | undefined,
  fields: { path: string; value: unknown }[],
  body: string,
): Promise<RepositoryResult<CreatedDatum>> {
  const capability = exactBaselineType(processPackage);
  if (!capability.ok) return capability;
  if (typeId !== capability.value) {
    return {
      ok: false,
      diagnostics: [{
        code: "baseline-type-mismatch",
        path: typeId,
        message: `Baseline creation requires the type '${capability.value}' bound to exact-baseline@1, received '${typeId}'`,
      }],
    };
  }
  return createDatum(
    root,
    processPackage,
    packageReference,
    packageDigest,
    typeId,
    scenarioReference,
    fields,
    [],
    body,
    [
      { path: "definition_members", value: [] },
      { path: "evidence", value: [] },
    ],
  );
}

export async function mutateExactBaseline(
  root: string,
  processPackage: ProcessPackage,
  baselineIdentity: string,
  targetRevision: string,
  section: "definition_members" | "evidence" | "composition",
  operation: "added" | "removed",
): Promise<RepositoryResult<BaselineMutation>> {
  const capability = exactBaselineType(processPackage);
  if (!capability.ok) return capability;
  if (!revisionIdentity.test(targetRevision)) {
    return {
      ok: false,
      diagnostics: [{
        code: "exact-target-revision-required",
        path: targetRevision,
        message: `Baseline mutation requires an exact target Revision ID, received '${targetRevision}'`,
      }],
    };
  }
  const loaded = await readRepositoryData(root, processPackage);
  if (!loaded.ok) return loaded;
  const source = exactBaselineSubject(
    loaded.value,
    baselineIdentity,
    capability.value,
    true,
  );
  if (!source.ok) return source;
  if (source.value.lifecycleDatum.datum.revision_id === targetRevision) {
    return {
      ok: false,
      diagnostics: [{
        code: "baseline-self-reference",
        path: targetRevision,
        message: `Exact baseline '${targetRevision}' cannot include itself`,
      }],
    };
  }
  const target = loaded.value.find((item) =>
    item.lifecycleDatum.datum.revision_id === targetRevision
  );
  if (!target) {
    return {
      ok: false,
      diagnostics: [{
        code: "baseline-reference-missing",
        path: targetRevision,
        message: `Baseline mutation references missing exact Revision '${targetRevision}'`,
      }],
    };
  }
  if (section === "composition" && (
    target.lifecycleDatum.datum.type !== capability.value ||
    !target.lifecycleDatum.storage.frozen
  )) {
    return {
      ok: false,
      diagnostics: [{
        code: "baseline-composition-not-frozen",
        path: targetRevision,
        message: `Composed baseline '${targetRevision}' must be a frozen exact Revision of bound type '${capability.value}'`,
      }],
    };
  }

  const datum = structuredClone(source.value.lifecycleDatum.datum);
  let operationName: BaselineMutation["operation"];
  if (section === "composition") {
    if (operation !== "added") {
      return {
        ok: false,
        diagnostics: [{
          code: "unsupported-baseline-mutation",
          path: section,
          message: "Baseline composition currently supports addition only",
        }],
      };
    }
    if (datum.links.some((link) =>
      link.type === "composes" && link.target === targetRevision
    )) {
      return {
        ok: false,
        diagnostics: [{
          code: "duplicate-baseline-reference",
          path: targetRevision,
          message: `Baseline already composes '${targetRevision}'`,
        }],
      };
    }
    datum.links.push({ type: "composes", target: targetRevision });
    datum.links.sort((left, right) =>
      left.type.localeCompare(right.type) || left.target.localeCompare(right.target)
    );
    operationName = "composition-added";
  } else {
    const values = exactRevisionList(datum.payload[section]);
    const index = values.indexOf(targetRevision);
    if (operation === "added") {
      if (index >= 0) {
        return {
          ok: false,
          diagnostics: [{
            code: "duplicate-baseline-reference",
            path: targetRevision,
            message: `Baseline ${section} already contains '${targetRevision}'`,
          }],
        };
      }
      values.push(targetRevision);
      values.sort();
    } else {
      if (index < 0) {
        return {
          ok: false,
          diagnostics: [{
            code: "unknown-baseline-reference",
            path: targetRevision,
            message: `Baseline ${section} does not contain '${targetRevision}'`,
          }],
        };
      }
      values.splice(index, 1);
    }
    datum.payload[section] = values;
    operationName = section === "definition_members"
      ? `definition-member-${operation}`
      : `evidence-${operation}`;
  }
  const referenceDiagnostics = baselineReferenceDiagnostics(
    loaded.value,
    datum,
    capability.value,
  );
  const cycleDiagnostics = compositionCycleDiagnostics(
    loaded.value.map((item) => item === source.value
      ? { ...item, lifecycleDatum: { ...item.lifecycleDatum, datum } }
      : item),
    datum.revision_id,
  );
  if (referenceDiagnostics.length + cycleDiagnostics.length > 0) {
    return {
      ok: false,
      diagnostics: [...referenceDiagnostics, ...cycleDiagnostics],
    };
  }
  const replaced = await replaceRepositoryDatum(
    root,
    processPackage,
    loaded.value,
    source.value,
    datum,
  );
  if (!replaced.ok) return replaced;
  return {
    ok: true,
    value: {
      operation: operationName,
      baselineRevision: datum.revision_id,
      target: targetRevision,
    },
    diagnostics: [],
  };
}

async function finalizeExactBaselineDatumFromRepository(
  root: string,
  processPackage: ProcessPackage,
  processRef: string,
  parsed: ParsedDatum[],
  proposedDatum: DatumEnvelope,
): Promise<RepositoryResult<{ output: KernelFinalizedScenarioOutput; freeze: BaselineFreeze }>> {
  const capability = exactBaselineType(processPackage);
  if (!capability.ok) return capability;
  if (proposedDatum.type !== capability.value) {
    return {
      ok: false,
      diagnostics: [{
        code: "baseline-type-mismatch",
        path: proposedDatum.revision_id,
        message: `Lifecycle Datum '${proposedDatum.revision_id}' is not the type '${capability.value}' bound to exact-baseline@1`,
      }],
    };
  }
  if (Object.hasOwn(proposedDatum.payload, "snapshot")) {
    return {
      ok: false,
      diagnostics: [{
        code: "kernel-managed-payload",
        path: "payload.snapshot",
        message: "Scenario output may not author kernel-managed payload path 'snapshot'",
      }],
    };
  }

  const datum = structuredClone(proposedDatum);
  const proposedRecord: ParsedDatum = {
    lifecycleDatum: provisionalLifecycleRecord(datum),
    relativePath: "",
  };
  const withProposal = [
    ...parsed.filter((item) =>
      item.lifecycleDatum.datum.revision_id !== datum.revision_id
    ),
    proposedRecord,
  ];
  const definitionMembers = exactRevisionList(datum.payload.definition_members);
  const evidence = exactRevisionList(datum.payload.evidence);
  const composition = compositionRevisions(datum);
  const diagnostics = [
    ...baselineReferenceDiagnostics(withProposal, datum, capability.value),
    ...compositionCycleDiagnostics(withProposal, datum.revision_id),
  ];
  if (diagnostics.length > 0) return { ok: false, diagnostics };
  for (const identity of composition) {
    const verified = await verifyExactBaseline(
      root,
      processPackage,
      processRef,
      identity,
    );
    if (!verified.ok) {
      return {
        ok: false,
        diagnostics: [{
          code: "baseline-composition-invalid",
          path: identity,
          message: `Composed exact baseline '${identity}' failed verification`,
        }, ...verified.diagnostics],
      };
    }
  }
  const references = [...new Set([
    ...definitionMembers,
    ...evidence,
    ...composition,
  ])].sort();
  const memberHashes: Record<string, string> = {};
  for (const identity of references) {
    const item = parsed.find((candidate) =>
      candidate.lifecycleDatum.datum.revision_id === identity
    );
    if (item) memberHashes[identity] = await sha256File(path.join(root, item.relativePath));
  }
  const frozenAt = new Date().toISOString();
  const provenanceData = [datum, ...references.flatMap((identity) => {
    const item = parsed.find((candidate) =>
      candidate.lifecycleDatum.datum.revision_id === identity
    );
    return item ? [item.lifecycleDatum.datum] : [];
  })];
  datum.payload.snapshot = {
    frozen_at: frozenAt,
    member_hashes: memberHashes,
    resolved_links: resolvedLinks(
      withProposal.map((item) => item === proposedRecord
        ? { ...item, lifecycleDatum: { ...item.lifecycleDatum, datum } }
        : item),
      [datum.revision_id, ...references].sort(),
    ),
    process_provenance: {
      process_ref: processRef,
      manifest_hash: await sha256File(path.join(processPackage.root, "manifest.yaml")),
      asset_refs: processAssetRefs(processPackage, provenanceData),
    },
  };
  return {
    ok: true,
    value: {
      output: { capability: "exact-baseline@1", datum },
      freeze: {
        baselineRevision: datum.revision_id,
        frozenAt,
        definitionMembers,
        evidence,
        composition,
        hashes: references.length,
        processRef,
      },
    },
    diagnostics: [],
  };
}

export async function finalizeExactBaselineScenarioOutput(
  root: string,
  processPackage: ProcessPackage,
  processRef: string,
  proposedDatum: DatumEnvelope,
): Promise<RepositoryResult<{ output: KernelFinalizedScenarioOutput; freeze: BaselineFreeze }>> {
  const loaded = await readRepositoryData(root, processPackage);
  if (!loaded.ok) return loaded;
  return finalizeExactBaselineDatumFromRepository(
    root,
    processPackage,
    processRef,
    loaded.value,
    proposedDatum,
  );
}

export async function freezeExactBaseline(
  root: string,
  processPackage: ProcessPackage,
  processRef: string,
  baselineIdentity: string,
): Promise<RepositoryResult<BaselineFreeze>> {
  const capability = exactBaselineType(processPackage);
  if (!capability.ok) return capability;
  const loaded = await readRepositoryData(root, processPackage);
  if (!loaded.ok) return loaded;
  const source = exactBaselineSubject(
    loaded.value,
    baselineIdentity,
    capability.value,
    true,
  );
  if (!source.ok) return source;
  const finalized = await finalizeExactBaselineDatumFromRepository(
    root,
    processPackage,
    processRef,
    loaded.value,
    source.value.lifecycleDatum.datum,
  );
  if (!finalized.ok) return finalized;
  const replaced = await replaceRepositoryDatum(
    root,
    processPackage,
    loaded.value,
    source.value,
    finalized.value.output.datum,
  );
  if (!replaced.ok) return replaced;
  return { ok: true, value: finalized.value.freeze, diagnostics: [] };
}

function objectRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function verifyExactBaseline(
  root: string,
  processPackage: ProcessPackage,
  processRef: string,
  baselineIdentity: string,
): Promise<RepositoryResult<BaselineVerification>> {
  const capability = exactBaselineType(processPackage);
  if (!capability.ok) return capability;
  const loaded = await readRepositoryData(root, processPackage);
  if (!loaded.ok) return loaded;
  const source = exactBaselineSubject(
    loaded.value,
    baselineIdentity,
    capability.value,
    false,
  );
  if (!source.ok) return source;
  const datum = source.value.lifecycleDatum.datum;
  const snapshot = objectRecord(datum.payload.snapshot);
  if (Object.keys(snapshot).length === 0) {
    return {
      ok: false,
      diagnostics: [{
        code: "baseline-not-frozen",
        path: datum.revision_id,
        message: `Exact baseline '${datum.revision_id}' has not been frozen`,
      }],
    };
  }
  const definitionMembers = exactRevisionList(datum.payload.definition_members);
  const evidence = exactRevisionList(datum.payload.evidence);
  const composition = compositionRevisions(datum);
  const references = [...new Set([
    ...definitionMembers,
    ...evidence,
    ...composition,
  ])].sort();
  const diagnostics = [
    ...baselineReferenceDiagnostics(loaded.value, datum, capability.value),
    ...compositionCycleDiagnostics(loaded.value, datum.revision_id),
  ];
  if (!diagnostics.some((diagnostic) =>
    diagnostic.code === "baseline-composition-cycle"
  )) {
    for (const identity of composition) {
      const verified = await verifyExactBaseline(
        root,
        processPackage,
        processRef,
        identity,
      );
      if (!verified.ok) {
        diagnostics.push({
          code: "baseline-composition-invalid",
          path: identity,
          message: `Composed exact baseline '${identity}' failed verification`,
        }, ...verified.diagnostics);
      }
    }
  }
  const expectedHashes: Record<string, string> = {};
  for (const identity of references) {
    const item = loaded.value.find((candidate) =>
      candidate.lifecycleDatum.datum.revision_id === identity
    );
    if (item) expectedHashes[identity] = await sha256File(path.join(root, item.relativePath));
  }
  const storedHashes = objectRecord(snapshot.member_hashes);
  for (const identity of new Set([
    ...Object.keys(storedHashes),
    ...Object.keys(expectedHashes),
  ])) {
    if (storedHashes[identity] !== expectedHashes[identity]) {
      diagnostics.push({
        code: "baseline-hash-mismatch",
        path: identity,
        message: `Exact bytes for Revision '${identity}' do not match the frozen baseline hash`,
      });
    }
  }
  const resolutionSources = [datum.revision_id, ...references].sort();
  const storedResolutions = objectRecord(snapshot.resolved_links);
  if (!frozenResolutionsMatch(
    loaded.value,
    resolutionSources,
    storedResolutions,
  )) {
    diagnostics.push({
      code: "baseline-resolution-mismatch",
      path: datum.revision_id,
      message: `Resolved links for exact baseline '${datum.revision_id}' do not match the frozen snapshot`,
    });
  }
  for (const targets of Object.values(storedResolutions)) {
    if (!Array.isArray(targets)) continue;
    for (const target of targets) {
      if (
        typeof target === "string" && revisionIdentity.test(target) &&
        !loaded.value.some((item) =>
          item.lifecycleDatum.datum.revision_id === target
        )
      ) {
        diagnostics.push({
          code: "baseline-reference-missing",
          path: target,
          message: `Frozen link resolution references missing exact Revision '${target}'`,
        });
      }
    }
  }
  const storedProvenance = objectRecord(snapshot.process_provenance);
  const provenanceData = [datum, ...references.flatMap((identity) => {
    const item = loaded.value.find((candidate) =>
      candidate.lifecycleDatum.datum.revision_id === identity
    );
    return item ? [item.lifecycleDatum.datum] : [];
  })];
  const expectedProvenance = {
    process_ref: processRef,
    manifest_hash: await sha256File(path.join(processPackage.root, "manifest.yaml")),
    asset_refs: processAssetRefs(processPackage, provenanceData),
  };
  if (!structuralValuesEqual(storedProvenance, expectedProvenance)) {
    diagnostics.push({
      code: "baseline-process-provenance-mismatch",
      path: datum.revision_id,
      message: `Process provenance for exact baseline '${datum.revision_id}' does not match the selected package and frozen content`,
    });
  }
  if (diagnostics.length > 0) return { ok: false, diagnostics };
  return {
    ok: true,
    value: {
      baselineRevision: datum.revision_id,
      valid: true,
      definitionMembers,
      evidence,
      composition,
      checkedHashes: references.length,
      checkedResolutions: resolutionSources.length,
    },
    diagnostics: [],
  };
}

function frozenStableLinkResolutions(
  baseline: DatumEnvelope,
  source: DatumEnvelope,
): StableLinkResolution[] {
  const snapshot = objectRecord(baseline.payload.snapshot);
  const resolvedLinks = objectRecord(snapshot.resolved_links);
  const resolvedTargets = resolvedLinks[source.revision_id];
  const targets = Array.isArray(resolvedTargets)
    ? resolvedTargets.filter(
      (target): target is string => typeof target === "string",
    )
    : [];
  const remainingTargets = [...targets];
  for (const link of source.links) {
    if (
      !revisionIdentity.test(link.target) &&
      !isObligationInstanceIdentity(link.target)
    ) {
      continue;
    }
    const exactIndex = remainingTargets.indexOf(link.target);
    if (exactIndex >= 0) remainingTargets.splice(exactIndex, 1);
  }
  return source.links.flatMap((link) => {
    if (!stableIdentity.test(link.target)) return [];
    const targetIndex = remainingTargets.findIndex((target) =>
      revisionIdentity.exec(target)?.[1] === link.target
    );
    if (targetIndex < 0) return [];
    const [targetRevision] = remainingTargets.splice(targetIndex, 1);
    return targetRevision
      ? [{
          link: link.type,
          stableTarget: link.target,
          targetRevision,
        }]
      : [];
  }).sort((left, right) =>
    left.link.localeCompare(right.link) ||
    left.stableTarget.localeCompare(right.stableTarget)
  );
}

function comparedBaselineReferences(datum: DatumEnvelope): string[] {
  return [...new Set([
    ...exactRevisionList(datum.payload.definition_members),
    ...exactRevisionList(datum.payload.evidence),
  ])].sort();
}

function referencesByStableDatum(
  parsed: ParsedDatum[],
  references: string[],
): Map<string, ParsedDatum[]> {
  const result = new Map<string, ParsedDatum[]>();
  for (const reference of references) {
    const item = parsed.find((candidate) =>
      candidate.lifecycleDatum.datum.revision_id === reference
    );
    if (!item) continue;
    const stableId = item.lifecycleDatum.datum.id;
    result.set(stableId, [...(result.get(stableId) ?? []), item]);
  }
  return result;
}

export async function verifyRepositoryBaselines(
  root: string,
  processPackage: ProcessPackage,
  processRef: string,
): Promise<RepositoryResult<BaselineRepositoryVerification>> {
  const capability = exactBaselineType(processPackage);
  if (!capability.ok) {
    return {
      ok: true,
      value: { verifiedBaselines: 0, processDrift: 0 },
      diagnostics: [],
    };
  }
  const loaded = await readRepositoryData(root, processPackage);
  if (!loaded.ok) return loaded;
  const baselines = loaded.value.filter((item) =>
    item.lifecycleDatum.datum.type === capability.value &&
    Object.keys(objectRecord(item.lifecycleDatum.datum.payload.snapshot)).length > 0
  ).sort((left, right) =>
    left.lifecycleDatum.datum.revision_id.localeCompare(
      right.lifecycleDatum.datum.revision_id,
    )
  );
  const diagnostics: ProcessDiagnostic[] = [];
  let processDrift = 0;
  for (const baseline of baselines) {
    const verified = await verifyExactBaseline(
      root,
      processPackage,
      processRef,
      baseline.lifecycleDatum.datum.revision_id,
    );
    if (!verified.ok) {
      if (verified.diagnostics.some((diagnostic) =>
        diagnostic.code === "baseline-process-provenance-mismatch"
      )) {
        processDrift += 1;
      }
      diagnostics.push(...verified.diagnostics.filter((diagnostic) =>
        diagnostic.code !== "baseline-process-provenance-mismatch"
      ));
    }
  }
  if (diagnostics.length > 0) {
    const unique = new Map(diagnostics.map((diagnostic) => [
      `${diagnostic.code}\0${diagnostic.path ?? ""}\0${diagnostic.message}`,
      diagnostic,
    ]));
    return { ok: false, diagnostics: [...unique.values()] };
  }
  return {
    ok: true,
    value: { verifiedBaselines: baselines.length, processDrift },
    diagnostics: [],
  };
}

export async function diffExactBaselines(
  root: string,
  processPackage: ProcessPackage,
  processRef: string,
  beforeIdentity: string,
  afterIdentity: string,
): Promise<RepositoryResult<BaselineDiff>> {
  const capability = exactBaselineType(processPackage);
  if (!capability.ok) return capability;
  const loaded = await readRepositoryData(root, processPackage);
  if (!loaded.ok) return loaded;
  const before = exactBaselineSubject(
    loaded.value,
    beforeIdentity,
    capability.value,
    false,
  );
  if (!before.ok) return before;
  const after = exactBaselineSubject(
    loaded.value,
    afterIdentity,
    capability.value,
    false,
  );
  if (!after.ok) return after;
  for (const item of [before.value, after.value]) {
    if (Object.keys(objectRecord(item.lifecycleDatum.datum.payload.snapshot)).length === 0) {
      return {
        ok: false,
        diagnostics: [{
          code: "baseline-not-frozen",
          path: item.lifecycleDatum.datum.revision_id,
          message: `Exact baseline '${item.lifecycleDatum.datum.revision_id}' has not been frozen`,
        }],
      };
    }
  }

  const beforeDatum = before.value.lifecycleDatum.datum;
  const afterDatum = after.value.lifecycleDatum.datum;
  const comparisons: DependencyComparison[] = [{
    subjectRevision: afterDatum.revision_id,
    beforeRevision: beforeDatum.revision_id,
    afterRevision: afterDatum.revision_id,
    beforeStableLinkResolutions: frozenStableLinkResolutions(
      beforeDatum,
      beforeDatum,
    ),
    afterStableLinkResolutions: frozenStableLinkResolutions(
      afterDatum,
      afterDatum,
    ),
  }];
  const beforeReferences = referencesByStableDatum(
    loaded.value,
    comparedBaselineReferences(beforeDatum),
  );
  const afterReferences = referencesByStableDatum(
    loaded.value,
    comparedBaselineReferences(afterDatum),
  );
  for (const stableId of [...beforeReferences.keys()].filter((identity) =>
    afterReferences.has(identity)
  ).sort()) {
    const beforeItems = beforeReferences.get(stableId) ?? [];
    const afterItems = afterReferences.get(stableId) ?? [];
    if (beforeItems.length !== 1 || afterItems.length !== 1) {
      return {
        ok: false,
        diagnostics: [{
          code: "unsupported-baseline-comparison",
          path: stableId,
          message: `Baseline comparison requires at most one exact Revision of Stable Datum '${stableId}' in each definition/evidence set`,
        }],
      };
    }
    const beforeItem = beforeItems[0];
    const afterItem = afterItems[0];
    if (!beforeItem || !afterItem) continue;
    comparisons.push({
      subjectRevision: afterItem.lifecycleDatum.datum.revision_id,
      beforeRevision: beforeItem.lifecycleDatum.datum.revision_id,
      afterRevision: afterItem.lifecycleDatum.datum.revision_id,
      beforeStableLinkResolutions: frozenStableLinkResolutions(
        beforeDatum,
        beforeItem.lifecycleDatum.datum,
      ),
      afterStableLinkResolutions: frozenStableLinkResolutions(
        afterDatum,
        afterItem.lifecycleDatum.datum,
      ),
    });
  }

  const phaseId = Object.keys(processPackage.phases).sort()[0];
  if (!phaseId) {
    return {
      ok: false,
      diagnostics: [{
        code: "baseline-diff-phase-unavailable",
        path: "phases",
        message: "Package-derived baseline reassessment requires at least one Phase",
      }],
    };
  }
  const evaluation = evaluateLifecycle(processPackage, {
    processRef,
    phaseId,
    records: loaded.value.map((item) => item.lifecycleDatum),
    dependencyComparisons: comparisons,
  });
  if (evaluation.diagnostics.length > 0) {
    return { ok: false, diagnostics: evaluation.diagnostics };
  }
  const subjects = [...new Set(evaluation.dependencyChanges.map((change) =>
    change.subject_revision
  ))].sort().map((subjectRevision) => ({
    subjectRevision,
    changes: evaluation.dependencyChanges.filter((change) =>
      change.subject_revision === subjectRevision
    ),
    states: evaluation.artifacts[subjectRevision]?.states ?? {},
    stateExplanations:
      evaluation.artifacts[subjectRevision]?.stateExplanations ?? {},
  }));
  return {
    ok: true,
    value: {
      beforeBaseline: beforeDatum.revision_id,
      afterBaseline: afterDatum.revision_id,
      changes: evaluation.dependencyChanges,
      processDrift: evaluation.dependencyChanges.filter(
        (change): change is ProcessProvenanceDependencyChange =>
          change.kind === "process-provenance-change",
      ),
      subjects,
    },
    diagnostics: [],
  };
}

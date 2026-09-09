import type { DatumEnvelope, ProcessDiagnostic } from "./index.js";
import { latestRequirements, selectedRequirementGraph, type RequirementTraceBinding } from "./requirement-trace.js";

export type TraceQuery = { kind: "why"; path: string; line: number } | { kind: "impact"; requirement: string };
const targets = (datum: DatumEnvelope, type: string) => datum.links.filter(link => link.type === type).map(link => link.target);
const scopeTargets = (datum: DatumEnvelope) => datum.links.filter(link => link.type === "implements" || link.type === "verifies");
function selection(data: DatumEnvelope[], binding: RequirementTraceBinding, revision: string) {
  const implementation = data.find(d => d.type === binding.implementation_type && d.revision_id === revision);
  const selected = implementation && data.find(d => d.type === binding.type && targets(implementation, "implements").includes(d.revision_id));
  const diagnostics: ProcessDiagnostic[] = [];
  if (!implementation || !selected) diagnostics.push({ code: "trace-implementation-selection", message: "Select an exact implementation revision with an exact requirement graph" });
  const graph = selected ? selectedRequirementGraph(data, selected, binding) : undefined;
  diagnostics.push(...graph?.diagnostics ?? []);
  const scopes = data.filter(d => d.type === binding.scope_type && targets(d, "belongs-to").includes(revision));
  return { implementation, selected, graph, scopes, diagnostics };
}
function scopeView(scope: DatumEnvelope) {
  return { revision: scope.revision_id, path: scope.payload.path, name: scope.payload.name,
    role: scope.payload.role, blob: scope.payload.blob, source_commit: scope.payload.source_commit,
    ranges: scope.payload.ranges as { start: number; end: number }[], inherited: scope.payload.inherited === true,
    links: scopeTargets(scope) };
}

/** Historical selections stay exact. Traversal only follows normal directed links. */
export function inspectRequirementTrace(data: DatumEnvelope[], binding: RequirementTraceBinding,
  implementationRevision: string, query: TraceQuery) {
  const context = selection(data, binding, implementationRevision);
  const requirements = context.graph?.requirements ?? [];
  const byRevision = new Map(requirements.map(d => [d.revision_id, d]));
  const latest = new Map(latestRequirements(data, binding).map(d => [d.id, d]));
  const revisionAlternatives = requirements.flatMap(d => {
    const current = latest.get(d.id)!;
    return current.revision_id === d.revision_id ? [] : [{ id: d.id, selected: d.revision_id, latest: current.revision_id }];
  });
  const pathsToRoots = (start: string): string[][] => {
    const walk = (id: string, path: string[]): string[][] => {
      if (path.includes(id) || !byRevision.has(id)) return [];
      const next = [...path, id], parents = targets(byRevision.get(id)!, "decomposes");
      return parents.length ? parents.flatMap(parent => walk(parent, next)) : [next];
    };
    return walk(start, []);
  };
  const changed = new Set(revisionAlternatives.map(item => item.selected));
  const reassessment = requirements.flatMap(d => {
    const supersededAncestors = [...new Set(pathsToRoots(d.revision_id).flat().filter(id => changed.has(id)))];
    return supersededAncestors.length ? [{ requirement: d.revision_id, status: "requires-reassessment", supersededAncestors }] : [];
  });
  const base = { implementation: implementationRevision, selection: context.selected?.revision_id ?? null,
    source_commit: context.implementation?.payload.source_commit ?? null, query, resolvedRequirement: null as string | null, diagnostics: context.diagnostics,
    revisionAlternatives, reassessment,
    unselectedCurrentRequirements: [...latest.values()].filter(d => !requirements.some(r => r.id === d.id)).map(d => d.revision_id),
    requirements: requirements.map(d => ({ id: d.id, revision: d.revision_id, payload: d.payload, links: d.links, leaf: context.graph!.leaves.has(d.revision_id) })),
    inspectionOnly: true as const };
  const scopes: (ReturnType<typeof scopeView> & { reasons: { requirement: string; path: string[]; reason: string }[]; otherRequirements: { requirement: string; reason: string }[] })[] = [];
  if (context.diagnostics.length) return { ...base, scopes };
  if (query.kind === "why") {
    if (!Number.isInteger(query.line) || query.line < 1) base.diagnostics.push({ code: "trace-line-invalid", message: "Line must be a positive integer" });
    else for (const scope of context.scopes) {
      const view = scopeView(scope);
      if (view.path !== query.path || !view.ranges.some(range => range.start <= query.line && query.line <= range.end)) continue;
      scopes.push({ ...view, reasons: scopeTargets(scope).flatMap(link => pathsToRoots(link.target).map(path => ({ requirement: link.target, path,
        reason: `${link.type} through ${view.inherited ? "inherited file default" : "explicit region"}` }))), otherRequirements: [] });
    }
    if (!base.diagnostics.length && !scopes.length) base.diagnostics.push({ code: "trace-line-unattributed", message: "No effective source scope covers this line in the selected implementation" });
  } else {
    const requested = data.find(d => d.type === binding.requirement_type && d.revision_id === query.requirement);
    const root = requirements.find(d => d.revision_id === query.requirement || d.id === query.requirement || d.id === requested?.id);
    if (!root) base.diagnostics.push({ code: "trace-requirement-unselected", message: "Requirement has no revision in this implementation's selected graph" });
    else {
      base.resolvedRequirement = root.revision_id;
      // Paths begin at the requested requirement and proceed down decomposition.
      const paths = new Map<string, string[][]>();
      const descend = (id: string, path: string[]) => {
        if (path.includes(id)) return;
        const next = [...path, id]; paths.set(id, [...paths.get(id) ?? [], next]);
        for (const child of requirements) if (targets(child, "decomposes").includes(id)) descend(child.revision_id, next);
      };
      descend(root.revision_id, []);
      for (const scope of context.scopes) {
        const links = scopeTargets(scope), matched = links.filter(link => paths.has(link.target));
        if (!matched.length) continue;
        scopes.push({ ...scopeView(scope), reasons: matched.flatMap(link => paths.get(link.target)!.map(path => ({ requirement: link.target, path, reason: `${link.type} requested requirement or directed descendant` }))),
          otherRequirements: links.filter(link => !paths.has(link.target)).map(link => ({ requirement: link.target,
            reason: "Shares this source scope; inspect coupling without marking its siblings changed" })) });
      }
    }
  }
  return { ...base, scopes };
}

/** Candidate differences only: a changed blob or moved range does not prove changed code in that scope. */
export function compareImplementationScopes(data: DatumEnvelope[], binding: RequirementTraceBinding, beforeIMP: string, afterIMP: string) {
  const before = selection(data, binding, beforeIMP), after = selection(data, binding, afterIMP);
  const diagnostics = [...before.diagnostics, ...after.diagnostics];
  const key = (scope: DatumEnvelope) => JSON.stringify([scope.payload.path, scope.payload.name, scope.payload.role]);
  const old = new Map(before.scopes.map(scope => [key(scope), scope])), next = new Map(after.scopes.map(scope => [key(scope), scope]));
  const differences: { status: "added" | "deleted" | "changed"; before: ReturnType<typeof scopeView> | null; after: ReturnType<typeof scopeView> | null; reasons: string[]; defaultAttributionCandidate: boolean }[] = [];
  if (!diagnostics.length) for (const id of new Set([...old.keys(), ...next.keys()])) {
    const previous = old.get(id), current = next.get(id);
    const a = previous ? scopeView(previous) : null, b = current ? scopeView(current) : null;
    const reasons = !a ? ["scope added"] : !b ? ["scope deleted"] : [
      ...(a.blob !== b.blob ? ["file blob changed; inspect scope"] : []),
      ...(JSON.stringify(a.ranges) !== JSON.stringify(b.ranges) ? ["effective ranges changed"] : []),
      ...(JSON.stringify(a.links.map(l => `${l.type}:${l.target}`).sort()) !== JSON.stringify(b.links.map(l => `${l.type}:${l.target}`).sort()) ? ["requirement links changed"] : []),
      ...(a.inherited !== b.inherited ? ["default inheritance changed"] : []),
    ];
    if (reasons.length) differences.push({ status: !a ? "added" : !b ? "deleted" : "changed", before: a, after: b, reasons,
      defaultAttributionCandidate: b?.inherited === true });
  }
  return { before: beforeIMP, after: afterIMP, diagnostics, differences, exactAddedLinesKnown: false as const };
}

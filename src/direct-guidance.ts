import type { ResolvedType } from "./index.js";
import type { DirectContext, SourceAssessmentTargets } from "./direct-contract.js";
import { requirementTraceBinding } from "./requirement-trace.js";
import { assessRequirements, changeImpact, requirementAuthoringFrontier } from "./change-assessment.js";

/** Output contracts omit computed fields; records under review retain them. */
export function authorablePayloadSchema(type: ResolvedType): ResolvedType["payloadSchema"] {
  const schema = structuredClone(type.payloadSchema);
  for (const field of type.kernelManagedPayloadPaths) {
    delete schema.properties[field];
    schema.required = schema.required.filter(key => key !== field);
  }
  return schema;
}

/** Reuse the exact assessment used by publication, without proposing judgments. */
export function sourceAssessmentTargets(context: DirectContext): SourceAssessmentTargets | undefined {
  if (context.action.capability !== "review") return undefined;
  const trace = requirementTraceBinding(context.pkg);
  const subject = context.data.find(datum => datum.revision_id === context.subject);
  if (!trace || subject?.type !== trace.implementation_type) return undefined;
  const set = context.data.find(datum => datum.type === trace.type && subject.links.some(link => link.type === "implements" && link.target === datum.revision_id));
  if (!set?.links.some(link => link.type === "changes-under")) return undefined;
  return {
    field: "source_assessments[].source_scope",
    sourceScopes: assessRequirements(context.data, trace, set).sourceScopes,
    instruction: "Provide exactly one source_assessments row for each listed affected baseline revision. Current sourceScopes[].scopes and source comparison entries are evidence, not the required output-row set. Judge disposition and rationale independently.",
  };
}

/** Broad impact is evidence to inspect; only the frontier permits current edits. */
export function requirementAuthoringTargets(context: DirectContext) {
  if (context.action.capability !== "requirements") return undefined;
  const trace = requirementTraceBinding(context.pkg);
  if (!trace) return undefined;
  const selected = context.inputs[context.action.revises?.[trace.type] ?? ""]?.[0];
  const previous = context.data.find(datum => datum.revision_id === selected && datum.type === trace.type);
  if (!previous) return undefined;
  const inputIds = Object.values(context.inputs).flat();
  const change = context.data.find(datum => datum.type === trace.change_type && inputIds.includes(datum.revision_id))
    ?? context.data.find(datum => datum.type === trace.change_type && previous.links.some(link => link.type === "changes-under" && link.target === datum.revision_id));
  if (!change) return undefined;
  return {
    change: change.revision_id, selection: previous.revision_id,
    frontier: requirementAuthoringFrontier(context.data, trace, change, previous),
    impact: changeImpact(context.data, trace, change),
    instruction: "Revise existing requirements only at frontier.requirements. Group membership changes require frontier.groups or a parent in frontier.requirements. Impact lists affected evidence, not additional permission to revise descendants. Preserve unchanged records; independent review identifies subsequent corrections. New requirements must belong to an authorized group or frontier parent. All existing publication checks still apply.",
  };
}

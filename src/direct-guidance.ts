import type { ResolvedType } from "./index.js";
import type { DirectContext, SourceAssessmentTargets } from "./direct-contract.js";
import { requirementTraceBinding } from "./requirement-trace.js";
import { assessRequirements } from "./change-assessment.js";

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

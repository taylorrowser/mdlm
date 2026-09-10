import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { AssignmentPacket } from "./assignment.js";
import type { DatumEnvelope, ProcessPackage } from "./index.js";
import { readImplementationSource, requirementTraceBinding } from "./requirement-trace.js";
import { readScenarioExecution } from "./scenario-execution.js";
import { readVerificationReceiptBlob, requireVerificationReceipt, verificationBinding, verificationContract } from "./verification-receipt.js";

/** Canonical JSON sorts object keys recursively; arrays retain their order. */
export function canonicalReviewPacket(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalReviewPacket).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonicalReviewPacket(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

type SemanticPacket = Omit<AssignmentPacket, "contract" | "schemas" | "responseSchema" | "responseScaffold" | "requirementGraphs">;
export interface AssignmentReviewContext extends SemanticPacket {
  contract: "mdlm-assignment-review-context@1";
  fullPacket: { contract: AssignmentPacket["contract"]; sha256: string; serialization: string; bytes: number };
  requirementGraphs?: {selection: string; requirements: (NonNullable<AssignmentPacket["requirementGraphs"]>[number]["requirements"][number] & {body: string})[]}[];
  sources: {implementation: string; repositoryPath: string; sourceCommit: string; files: {path: string; role: string; mode: string; blob: string; content: string}[]}[];
  verificationReceipts: {result: string; implementation: string; requirements: string; locator: string; execution: string; binding: "validated"; receipt: Awaited<ReturnType<typeof readVerificationReceiptBlob>>["receipt"]}[];
}

/** Derived content only. The caller authenticates the active lease before and after gathering it. */
export async function buildAssignmentReviewContext(root: string, full: AssignmentPacket, pkg: ProcessPackage, data: readonly DatumEnvelope[]): Promise<AssignmentReviewContext> {
  const {contract, schemas: _schemas, responseSchema: _responseSchema, responseScaffold: _responseScaffold, requirementGraphs, ...semantic} = full;
  const canonical = canonicalReviewPacket(full);
  const context: AssignmentReviewContext = {
    contract: "mdlm-assignment-review-context@1", ...semantic,
    fullPacket: {contract, sha256: createHash("sha256").update(canonical).digest("hex"), serialization: "UTF-8 JSON: recursively sorted object keys, array order preserved, no whitespace or trailing newline", bytes: Buffer.byteLength(canonical)},
    ...(requirementGraphs ? {requirementGraphs: requirementGraphs.map(graph => ({...graph, requirements: graph.requirements.map(requirement => {
      const datum = data.find(value => value.revision_id === requirement.revision);
      if (!datum) throw new Error(`Requirement '${requirement.revision}' is unavailable`);
      return {...requirement, body: datum.body};
    })}))} : {}),
    sources: [], verificationReceipts: [],
  };
  const selected = [...new Map(full.exactInputs.flatMap(invocation => invocation.inputs.flatMap(input => input.values.map(value => [value.identity.revision_id, value.data] as const)))).values()] as DatumEnvelope[];
  const trace = requirementTraceBinding(pkg);
  const implementations = trace ? selected.filter(datum => datum.type === trace.implementation_type) : [];
  for (const implementation of implementations) {
    const source = await readImplementationSource(implementation);
    if (source.diagnostics.length) throw new Error(source.diagnostics.map(diagnostic => `${diagnostic.code}: ${diagnostic.path ?? ""} ${diagnostic.message}`).join("; "));
    const files = source.entries.map(entry => {
      if (!["100644", "100755"].includes(entry.mode)) throw new Error(`Unsupported source entry mode for '${entry.path}'`);
      let content: string;
      try {
        content = new TextDecoder("utf-8", {fatal: true, ignoreBOM: true}).decode(entry.bytes);
        if (content.includes("\0")) throw new Error("NUL byte");
      }
      catch { throw new Error(`Source '${entry.path}' is not supported UTF-8 text; review context is incomplete`); }
      return {path: entry.path, role: entry.role!, mode: entry.mode, blob: entry.blob, content};
    });
    context.sources.push({implementation: implementation.revision_id, repositoryPath: String(implementation.payload.repository_path), sourceCommit: String(implementation.payload.source_commit), files});
  }
  const resultType = pkg.kernelCapabilities["docker-verification@1"]?.type;
  const results = selected.filter(datum => datum.type === resultType);
  for (const result of results) {
    const match = typeof result.payload.receipt === "string" && /^git-blob:([a-f0-9]{40})$/.exec(result.payload.receipt);
    if (!match) throw new Error(`Result '${result.revision_id}' has no exact verification receipt`);
    // Resolve the immutable blob named by RES, never the executor's mutable latest ref.
    const raw = await readVerificationReceiptBlob(root, match[1]!);
    const transactions = await fs.readdir(path.join(root, ".lifecycle/data/.transactions"));
    const executions = [];
    for (const id of transactions) {
      const inspected = await readScenarioExecution(root, id);
      if (inspected.ok && inspected.value.outputs.some(output => output.lifecycleDatum.revisionId === result.revision_id && isDeepStrictEqual(output.data, result))) executions.push(inspected.value);
    }
    if (executions.length !== 1) throw new Error(`Result '${result.revision_id}' must have one authenticated publishing execution`);
    const execution = executions[0]!;
    const scenario = Object.values(pkg.scenarios).find(candidate => `${candidate.id}@${candidate.version}` === execution.definition.scenario);
    const marker = scenario && verificationContract(scenario);
    if (!marker || !scenario) throw new Error(`Result '${result.revision_id}' has no matching verification scenario`);
    const inputs = execution.inputs[0]?.inputs;
    const implementationId = inputs?.find(input => input.name === marker.implementation_input)?.values[0]?.identity.revision_id;
    const requirementsId = inputs?.find(input => input.name === marker.requirements_input)?.values[0]?.identity.revision_id;
    const implementation = implementations.find(datum => datum.revision_id === implementationId);
    if (!implementation || !selected.some(datum => datum.revision_id === requirementsId) || !isDeepStrictEqual(execution.package, full.package)) throw new Error(`Result '${result.revision_id}' does not bind the selected implementation, requirements and package`);
    const binding = verificationBinding(execution.response.assignment, execution.package, scenario, {invocations: execution.inputs});
    const validated = await requireVerificationReceipt(root, binding, match[1]!);
    if (!isDeepStrictEqual(raw, validated.saved) || validated.outcome !== result.payload.outcome) throw new Error(`Result '${result.revision_id}' conflicts with its verification receipt`);
    context.verificationReceipts.push({result: result.revision_id, implementation: implementationId!, requirements: requirementsId!, locator: result.payload.receipt as string, execution: execution.id, binding: "validated", receipt: validated.saved.receipt});
  }
  return context;
}

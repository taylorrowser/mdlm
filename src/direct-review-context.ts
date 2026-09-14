import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify, isDeepStrictEqual } from "node:util";
import { resolveType, type DatumEnvelope } from "./index.js";
import type { DirectContext, DirectTransaction, SourceAssessmentTargets } from "./direct-contract.js";
import { readImplementationSource, requirementTraceBinding, selectedRequirementGraph } from "./requirement-trace.js";
import { assessRequirements, changeImpact } from "./change-assessment.js";
import { compareImplementationScopes } from "./requirement-trace-inspection.js";
import { readVerificationReceiptBlob, validateVerificationReceipt, verificationRef } from "./verification-receipt.js";
import { repositoryGitEnvironment } from "./git-environment.js";
import { resolvePrompt } from "./direct-prompt.js";
import { authorablePayloadSchema, sourceAssessmentTargets } from "./direct-guidance.js";

const exec = promisify(execFile);
export interface DirectReviewContext {
  contract: "mdlm-direct-review-context@1";
  package: DirectContext["package"];
  snapshot: string;
  action: DirectContext["action"];
  subject?: string;
  inputs: DirectContext["inputs"];
  prompt: unknown;
  payloadSchemas: Record<string, unknown>;
  sourceAssessmentTargets?: SourceAssessmentTargets;
  records: DatumEnvelope[];
  requirementGraphs: {selection: string; assessment: ReturnType<typeof assessRequirements>; groups: DatumEnvelope[]; requirements: (DatumEnvelope & {leaf: boolean})[]}[];
  sourceScopes: {implementation: string; scopes: DatumEnvelope[]; changes: unknown; comparison: unknown}[];
  prospectiveChange?: unknown;
  sources: {implementation: string; repositoryPath: string; sourceCommit: string; files: {path: string; role: string; mode: string; blob: string; content: string}[]}[];
  verificationReceipts: {result: string; implementation: string; requirements: string; locator: string; execution: string; binding: "validated"; receipt: Awaited<ReturnType<typeof readVerificationReceiptBlob>>["receipt"]}[];
}

/** The caller authenticates context freshness before registration/publication. */
export async function buildDirectReviewContext(context: DirectContext): Promise<DirectReviewContext> {
  const {root, pkg, data} = context;
  const prompt = await resolvePrompt(pkg, context.action.prompt_ref);
  if (!prompt.prompt || prompt.diagnostics.length) throw new Error("The exact review prompt could not be resolved");
  const payloadSchemas: Record<string, unknown> = {};
  for (const type of context.action.types) {
    const resolved = resolveType(pkg, type);
    if (!resolved.ok) throw new Error(`Review output type '${type}' could not be resolved`);
    payloadSchemas[type] = authorablePayloadSchema(resolved.type);
  }
  const selectedIds = new Set([...Object.values(context.inputs).flat(), ...(context.subject ? [context.subject] : [])]);
  for (const id of selectedIds) if (!data.some(datum => datum.revision_id === id)) throw new Error(`Review input '${id}' is unavailable`);
  const selected = data.filter(datum => selectedIds.has(datum.revision_id));
  const result: DirectReviewContext = {contract: "mdlm-direct-review-context@1", package: context.package, snapshot: context.snapshot, action: context.action, ...(context.subject ? {subject: context.subject} : {}), inputs: context.inputs, prompt: prompt.prompt, payloadSchemas, sourceAssessmentTargets: sourceAssessmentTargets(context), records: selected, requirementGraphs: [], sourceScopes: [], sources: [], verificationReceipts: []};
  const trace = requirementTraceBinding(pkg);
  if (!trace) return result;
  const changes = selected.filter(datum => datum.type === trace.change_type);
  if (changes.length === 1) {
    const change = changes[0]!, baseline = data.find(datum => datum.revision_id === change.links.find(link => link.type === "baseline")?.target);
    const impact = changeImpact(data, trace, change);
    result.prospectiveChange = {...impact, change: change.revision_id, baseline: baseline?.revision_id, request: change.payload, scopes: data.filter(datum => impact.sourceScopes.includes(datum.revision_id))};
    for (const link of baseline?.links ?? []) if (link.type === "confirms") selectedIds.add(link.target);
  }
  const implementations = selected.filter(datum => datum.type === trace.implementation_type);
  const sets = data.filter(datum => datum.type === trace.type && (selectedIds.has(datum.revision_id) || implementations.some(implementation => implementation.links.some(link => link.type === "implements" && link.target === datum.revision_id))));
  for (const set of sets) {
    const graph = selectedRequirementGraph(data, set, trace);
    if (graph.diagnostics.length) throw new Error(`Review requirement graph '${set.revision_id}' is invalid: ${JSON.stringify(graph.diagnostics)}`);
    result.requirementGraphs.push({selection: set.revision_id, assessment: assessRequirements(data, trace, set), groups: graph.groups, requirements: graph.requirements.map(datum => ({...datum, leaf: graph.leaves.has(datum.revision_id)}))});
  }
  for (const implementation of implementations) {
    const baseline = (implementation.payload.source_changes as {baseline_implementation?: unknown} | undefined)?.baseline_implementation;
    result.sourceScopes.push({implementation: implementation.revision_id, scopes: data.filter(datum => datum.type === trace.scope_type && datum.links.some(link => link.type === "belongs-to" && link.target === implementation.revision_id)), changes: implementation.payload.source_changes ?? null, comparison: typeof baseline === "string" ? compareImplementationScopes(data, trace, baseline, implementation.revision_id) : null});
    const source = await readImplementationSource(implementation);
    if (source.diagnostics.length) throw new Error(JSON.stringify(source.diagnostics));
    const files = source.entries.map(entry => {
      if (!["100644", "100755"].includes(entry.mode)) throw new Error(`Unsupported source entry mode for '${entry.path}'`);
      let content: string;
      try { content = new TextDecoder("utf-8", {fatal: true, ignoreBOM: true}).decode(entry.bytes); if (content.includes("\0")) throw new Error("NUL byte"); }
      catch { throw new Error(`Source '${entry.path}' is not supported UTF-8 text; review context is incomplete`); }
      return {path: entry.path, role: entry.role!, mode: entry.mode, blob: entry.blob, content};
    });
    result.sources.push({implementation: implementation.revision_id, repositoryPath: String(implementation.payload.repository_path), sourceCommit: String(implementation.payload.source_commit), files});
  }
  const results = selected.filter(datum => datum.type === trace.result_type);
  for (const datum of results) {
    const locator = typeof datum.payload.receipt === "string" && /^git-blob:([a-f0-9]{40})$/.exec(datum.payload.receipt);
    if (!locator) throw new Error(`Result '${datum.revision_id}' has no exact verification receipt`);
    const saved = await readVerificationReceiptBlob(root, locator[1]!);
    const transactions: DirectTransaction[] = [];
    for (const id of await fs.readdir(path.join(root, ".lifecycle/data/.transactions"))) {
      const transaction = JSON.parse(await fs.readFile(path.join(root, ".lifecycle/data/.transactions", id, "execution.json"), "utf8")) as DirectTransaction;
      if (transaction.contract === "mdlm-direct-transaction@1" && transaction.outputs.some(output => isDeepStrictEqual(output, datum))) transactions.push(transaction);
    }
    if (transactions.length !== 1) throw new Error(`Result '${datum.revision_id}' must have one authenticated direct publication`);
    const transaction = transactions[0]!;
    const implementation = implementations.find(value => datum.links.some(link => link.target === value.revision_id));
    const requirements = sets.find(value => datum.links.some(link => link.target === value.revision_id));
    if (!implementation || !requirements || !isDeepStrictEqual(transaction.package, context.package)) throw new Error("Verification result does not bind the selected implementation, requirements and package");
    const binding = saved.receipt.binding;
    if (!binding.operation || !/^[a-zA-Z0-9-]{1,80}$/.test(binding.operation) || !Number.isInteger(saved.receipt.attempt) || saved.receipt.attempt < 1) throw new Error("Review requires a direct execution receipt");
    const inputs = [{name: "implementation", revisions: [implementation.revision_id]}, {name: "requirements", revisions: [requirements.revision_id]}];
    if (!isDeepStrictEqual(binding.inputs, inputs)) throw new Error("Receipt inputs differ from the selected implementation and requirements");
    const transactionIds = Object.values(transaction.inputs).flat();
    if (![implementation.revision_id, requirements.revision_id].every(id => transactionIds.includes(id) || transaction.subject === id)) throw new Error("Result transaction does not bind its exact implementation and requirements");
    const expected = {...binding, inputs, package: context.package, repositoryPath: implementation.payload.repository_path as string, sourceCommit: implementation.payload.source_commit as string, image: implementation.payload.verification_image as string, command: implementation.payload.verification_command as string[], scriptPath: implementation.payload.verification_script as string};
    const verified = await validateVerificationReceipt(expected, saved);
    const registered = (await exec("git", ["-C", root, "rev-parse", "--verify", `${verificationRef(binding)}/attempt-${saved.receipt.attempt}-receipt`], {env: repositoryGitEnvironment()})).stdout.trim();
    if (registered !== saved.oid || verified.outcome !== datum.payload.outcome) throw new Error("Result conflicts with its registered execution receipt");
    result.verificationReceipts.push({result: datum.revision_id, implementation: implementation.revision_id, requirements: requirements.revision_id, locator: datum.payload.receipt as string, execution: transaction.id, binding: "validated", receipt: saved.receipt});
  }
  return result;
}

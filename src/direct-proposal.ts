import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify, isDeepStrictEqual } from "node:util";
import { resolveType, type DatumEnvelope, type ProcessPackage, type KernelCapabilityBinding } from "./index.js";
import { selectedRepositoryPackage } from "./selected-package.js";
import { readRepositoryData, publishScenarioMutationData } from "./lifecycle-repository.js";
import { withRepositoryLock } from "./repository-lock.js";
import { resolvePrompt } from "./scenario-dry-run.js";
import { readVerificationReceiptBlob, validateVerificationReceipt, type VerificationBinding } from "./verification-receipt.js";
import { repositoryGitEnvironment } from "./git-environment.js";

const exec = promisify(execFile);
const digest = (value: unknown) => `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
const capability = "direct-observation@1";
const transactionKind = "direct-proposal@1";
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
function fail(message: string): never { throw new Error(message); }
function binding(pkg: ProcessPackage): KernelCapabilityBinding {
  const value = pkg.kernelCapabilities[capability];
  if (!value || !value.implementation_type || !value.requirement_type || !value.subject_link || !value.context_link || !value.input_link || !value.prompt_ref) fail("Package does not support direct observation guidance and publication");
  // This route grants no independent review or stakeholder authority.
  if (Object.values(pkg.scenarios).some(s => object(s.authority_evidence) && s.authority_evidence.type === value.type)) fail("Authority evidence cannot use direct observation publication");
  return value;
}
function identity(summary: {reference: string; digest: string; language: string}) { return {reference: summary.reference, digest: summary.digest, language: summary.language}; }
async function state(root: string) {
  const selected = await selectedRepositoryPackage(root);
  if (!selected.ok) fail(JSON.stringify(selected.diagnostics));
  const loaded = await readRepositoryData(root, selected.processPackage);
  if (!loaded.ok) fail(JSON.stringify(loaded.diagnostics));
  const data = loaded.value.map(p => p.lifecycleDatum.datum).sort((a,b) => a.revision_id.localeCompare(b.revision_id));
  const packageIdentity = identity(selected.summary);
  return {...selected, parsed: loaded.value, data, packageIdentity, snapshot: digest({package: packageIdentity, data})};
}
function exactSubjects(data: DatumEnvelope[], config: KernelCapabilityBinding, revision: string) {
  const trial = data.find(d => d.revision_id === revision && d.type === config.implementation_type);
  if (!trial) fail("Expected an exact supported prototype revision");
  const links = trial.links.filter(l => l.type === config.input_link);
  const experiment = links.length === 1 ? data.find(d => d.revision_id === links[0]!.target && d.type === config.requirement_type) : undefined;
  if (!experiment) fail("Prototype must link to one exact experiment");
  return {trial, experiment};
}
async function git(root: string, args: string[]) {
  return (await exec("git", ["-C", root, ...args], {env: repositoryGitEnvironment(), maxBuffer: 16 * 1024 * 1024})).stdout.trim();
}
async function receiptFor(root: string, oid: string, packageIdentity: unknown, trial: DatumEnvelope, experiment: DatumEnvelope) {
  const saved = await readVerificationReceiptBlob(root, oid);
  const b = saved.receipt.binding;
  if (!b || !/^[a-zA-Z0-9-]+$/.test(b.assignment) || !Number.isInteger(saved.receipt.attempt) || saved.receipt.attempt < 1) fail("Invalid receipt provenance");
  const registered = await git(root, ["rev-parse", "--verify", `refs/mdlm/verification/${b.assignment}/attempt-${saved.receipt.attempt}-receipt`]);
  if (registered !== oid) fail("Receipt is not registered to its original execution");
  const payload = trial.payload;
  const expected: VerificationBinding = {
    assignment: b.assignment, package: packageIdentity,
    inputs: [{name: "trial", revisions: [trial.revision_id]}, {name: "experiment", revisions: [experiment.revision_id]}],
    repositoryPath: payload.repository_path as string, sourceCommit: payload.source_commit as string,
    image: payload.verification_image as string, command: payload.verification_command as string[], scriptPath: payload.verification_script as string,
  };
  // Historical execution identity is retained. No new authoring Assignment is allocated.
  const verified = await validateVerificationReceipt(expected, saved);
  if (verified.outcome !== "pass") fail("Direct keep observations require a passing receipt; other outcomes use the existing execution route");
  return verified;
}
async function availableReceipts(root: string, packageIdentity: unknown, trial: DatumEnvelope, experiment: DatumEnvelope) {
  const refs = await git(root, ["for-each-ref", "--format=%(objectname)", "refs/mdlm/verification"]);
  const results: string[] = [];
  for (const oid of new Set(refs.split("\n").filter(Boolean))) {
    try { await receiptFor(root, oid, packageIdentity, trial, experiment); results.push(`git-blob:${oid}`); } catch { /* Other subjects and incomplete attempts are not this evidence. */ }
  }
  return results;
}
export async function inspectDirectExpectations(root: string, subject?: string) {
  const current = await state(root);
  const config = binding(current.processPackage);
  const missing = current.data.filter(d => d.type === config.implementation_type && !current.data.some(o => o.type === config.type && o.links.some(l => l.type === config.subject_link && l.target === d.revision_id)));
  const common = {package: current.packageIdentity, snapshot: current.snapshot};
  if (!subject) return {ok: true, contract: "mdlm-expectations@1" as const, ...common, items: missing.map(d => ({subject: d.revision_id, type: config.type, guidance: `mdlm expectations show ${d.revision_id} --json`}))};
  if (!missing.some(d => d.revision_id === subject)) fail("No supported missing observation for this exact subject");
  const {trial, experiment} = exactSubjects(current.data, config, subject);
  const resolved = resolveType(current.processPackage, config.type);
  if (!resolved.ok) fail(JSON.stringify(resolved.diagnostics));
  const prompt = await resolvePrompt(current.processPackage, config.prompt_ref!);
  if (!prompt.prompt || prompt.diagnostics.length) fail(JSON.stringify(prompt.diagnostics));
  const schema = structuredClone(resolved.type.payloadSchema) as Record<string, any>;
  for (const field of resolved.type.kernelManagedPayloadPaths) { delete schema.properties?.[field]; if (Array.isArray(schema.required)) schema.required = schema.required.filter((x: string) => x !== field); }
  if (schema.properties?.recommendation) schema.properties.recommendation = {const: "keep"};
  return {ok: true, contract: "mdlm-expectation-guidance@1" as const, ...common, subject, prompt: prompt.prompt, payloadSchema: schema,
    context: {trial, experiment}, evidence: await availableReceipts(root, current.packageIdentity, trial, experiment),
    candidate: {type: config.type, links: [{type: config.subject_link, target: trial.revision_id}, {type: config.context_link, target: experiment.revision_id}], payload: Object.fromEntries(Object.entries(schema.properties ?? {}).flatMap(([key, value]) => object(value) && "const" in value ? [[key, value.const]] : [])), body: ""},
    managedFields: resolved.type.kernelManagedPayloadPaths, limits: "Only passing keep observations; no user acceptance or independent review. Guidance is not authority; no gap token is required."};
}
interface DirectProposal {
  operation: string;
  package: {reference: string; digest: string};
  snapshot: string;
  evidence: string;
  datum: {type: string; links: {type: string; target: string}[]; payload: Record<string, unknown>; body: string};
}
function parseProposal(source: string): DirectProposal {
  const p: unknown = JSON.parse(source);
  if (!object(p) || Object.keys(p).some(k => !["operation", "package", "snapshot", "evidence", "datum"].includes(k)) || typeof p.operation !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(p.operation) || !object(p.package) || typeof p.snapshot !== "string" || typeof p.evidence !== "string" || !object(p.datum) || typeof p.datum.type !== "string" || !Array.isArray(p.datum.links) || !p.datum.links.every(l => object(l) && typeof l.type === "string" && typeof l.target === "string") || !object(p.datum.payload) || typeof p.datum.body !== "string" || Object.keys(p.datum).some(k => !["type", "links", "payload", "body"].includes(k))) fail("Expected operation, package, snapshot, evidence and candidate datum");
  return p as unknown as DirectProposal;
}
const transactionId = (operation: string) => `direct-${createHash("sha256").update(operation).digest("hex")}`;
async function settlement(root: string, operation: string) {
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(operation)) fail("Invalid operation identity");
  const id = transactionId(operation);
  try {
    const record = JSON.parse(await fs.readFile(path.join(root, ".lifecycle/data/.transactions", id, "execution.json"), "utf8"));
    if (record.contract !== transactionKind || record.operation !== operation || record.id !== id) fail("Invalid direct publication settlement");
    const current = await state(root);
    if (!current.data.some(d => isDeepStrictEqual(d, record.datum))) fail("Settlement does not authenticate a published datum");
    return {record, result: {ok: true, contract: "mdlm-proposal-result@1" as const, outcome: "accepted" as const, operation, transaction: id, revision: record.datum.revision_id}};
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}
export async function inspectDirectSettlement(root: string, operation: string) {
  const found = await settlement(root, operation);
  return found?.result ?? {ok: true, contract: "mdlm-proposal-result@1" as const, outcome: "not-published" as const, operation};
}
export async function submitDirectProposal(root: string, source: string) {
  const proposal = parseProposal(source);
  const responseDigest = digest(proposal);
  return withRepositoryLock(root, "refs/mdlm/assignment-lease-lock", async () => {
    const previous = await settlement(root, proposal.operation);
    if (previous) {
      if (previous.record.proposalDigest !== responseDigest) fail("Operation already published with different candidate bytes");
      return previous.result;
    }
    const current = await state(root);
    const config = binding(current.processPackage);
    if (!isDeepStrictEqual(proposal.package, current.packageIdentity) || proposal.snapshot !== current.snapshot) fail("Proposal snapshot or package changed; refresh before publication");
    if (proposal.datum.type !== config.type || proposal.datum.payload.recommendation !== "keep") fail("This direct route supports only keep observations");
    const trialLinks = proposal.datum.links.filter(l => l.type === config.subject_link);
    if (trialLinks.length !== 1) fail("Candidate must identify one exact prototype");
    const {trial, experiment} = exactSubjects(current.data, config, trialLinks[0]!.target);
    if (!isDeepStrictEqual(proposal.datum.links, [{type: config.subject_link, target: trial.revision_id}, {type: config.context_link, target: experiment.revision_id}])) fail("Candidate links must identify the exact prototype and its experiment");
    if (current.data.some(d => d.type === config.type && d.links.some(l => l.type === config.subject_link && l.target === trial.revision_id))) fail("Prototype already has an observation; revisions are outside this slice");
    const resolved = resolveType(current.processPackage, config.type);
    if (!resolved.ok) fail(JSON.stringify(resolved.diagnostics));
    if (resolved.type.kernelManagedPayloadPaths.some(k => k in proposal.datum.payload)) fail("Candidate may not author kernel-managed payload");
    if (!/^git-blob:[a-f0-9]{40}$/.test(proposal.evidence)) fail("Evidence must identify an exact receipt blob");
    const receipt = await receiptFor(root, proposal.evidence.slice(9), current.packageIdentity, trial, experiment);
    const prompt = await resolvePrompt(current.processPackage, config.prompt_ref!);
    if (!prompt.prompt || prompt.diagnostics.length) fail("Direct observation prompt unavailable");
    const id = `${config.type}-${createHash("sha256").update(proposal.operation).digest("hex").slice(0,12).toUpperCase()}`;
    const datum: DatumEnvelope = {id, revision: 1, revision_id: `${id}-r00001`, type: config.type,
      payload: {...proposal.datum.payload, outcome: receipt.outcome, receipt: receipt.receipt}, links: proposal.datum.links,
      body: proposal.datum.body, created_by: {transaction: transactionKind, process_ref: `${current.packageIdentity.reference}#${current.packageIdentity.digest}`, prompt_ref: config.prompt_ref, loaded_skill_refs: prompt.prompt.skills.map(s => s.reference), policy_refs: []}};
    const executionId = transactionId(proposal.operation);
    const record = {contract: transactionKind, id: executionId, operation: proposal.operation, proposalDigest: responseDigest, package: current.packageIdentity, snapshot: current.snapshot, evidence: receipt.receipt, datum};
    const published = await publishScenarioMutationData(root, current.processPackage, current.parsed, current.data, [datum], executionId, record, [{capability: "docker-verification@1", datum}], async () => {
      const fresh = await state(root);
      return fresh.snapshot === current.snapshot ? {ok: true, value: undefined, diagnostics: []} : {ok: false, diagnostics: [{code: "proposal-conflict", message: "Repository changed before publication"}]};
    });
    if (!published.ok) fail(JSON.stringify(published.diagnostics));
    return {ok: true, contract: "mdlm-proposal-result@1" as const, outcome: "accepted" as const, operation: proposal.operation, transaction: executionId, revision: datum.revision_id};
  });
}

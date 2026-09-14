import { execFile } from "node:child_process";
import { promisify, isDeepStrictEqual } from "node:util";
import { promises as fs } from "node:fs";
import path from "node:path";
import { executeDockerVerification, authenticateVerificationSource } from "./docker-verification.js";
import { repositoryGitEnvironment } from "./git-environment.js";
import type { VersionedDefinition } from "./index.js";

const exec = promisify(execFile);
export interface VerificationBinding {
  assignment: string;
  package: unknown;
  inputs: unknown;
  repositoryPath: string;
  sourceCommit: string;
  image: string;
  command: string[];
  scriptPath: string;
}
export function verificationContract(scenario: VersionedDefinition): {implementation_input: string; requirements_input: string; output: string} | undefined {
  const marker = scenario.kernel_execution as Record<string, unknown> | undefined;
  return marker?.kind === "docker-verification@1" ? marker as unknown as {implementation_input: string; requirements_input: string; output: string} : undefined;
}
const ref = (assignment: string) => `refs/mdlm/verification/${assignment}`;
async function git(root: string, args: string[]) {
  return (await exec("git", ["-C", root, ...args], {env: repositoryGitEnvironment(), maxBuffer: 16 * 1024 * 1024})).stdout.trim();
}
export async function readVerificationReceipt(root: string, assignment: string) {
  const found = await exec("git", ["-C", root, "rev-parse", "--verify", "--quiet", `${ref(assignment)}/latest`], {env: repositoryGitEnvironment()}).catch(error => {
    if (error.code === 1) return undefined;
    throw error;
  });
  if (!found) return undefined;
  const oid = found.stdout.trim();
  return readVerificationReceiptBlob(root, oid);
}
export async function readVerificationReceiptBlob(root: string, oid: string) {
  if (!/^[a-f0-9]{40}$/.test(oid)) throw new Error("Verification receipt must name an exact Git blob");
  const source = await git(root, ["cat-file", "blob", oid]);
  return {oid, receipt: JSON.parse(source) as {binding: VerificationBinding; attempt: number; result?: Awaited<ReturnType<typeof executeDockerVerification>>; state: string}};
}
export async function runVerificationReceipt(root: string, binding: VerificationBinding, retry: boolean) {
  const previous = await readVerificationReceipt(root, binding.assignment);
  if (previous) {
    if (!isDeepStrictEqual(previous.receipt.binding, binding)) throw new Error("Verification receipt inputs do not match this Assignment");
    if (previous.receipt.result && (!retry || previous.receipt.result.started)) return previous;
    if (!retry) throw new Error("Previous verification attempt did not complete. Inspect its receipt; use assignment run --retry after environment repair");
  }
  const attempt = (previous?.receipt.attempt ?? 0) + 1;
  const persist = async (receipt: object, expected: string) => {
    const directory = path.join(root, ".lifecycle/work/verification", binding.assignment);
    await fs.mkdir(directory, {recursive: true});
    const file = path.join(directory, `${attempt}-${"result" in receipt ? "receipt" : "started"}.json`);
    await fs.writeFile(file, JSON.stringify(receipt, null, 2) + "\n", {flag: "wx"});
    const oid = await git(root, ["hash-object", "-w", file]);
    await git(root, ["update-ref", `${ref(binding.assignment)}/attempt-${attempt}-${"result" in receipt ? "receipt" : "started"}`, oid, "0".repeat(40)]);
    await git(root, ["update-ref", `${ref(binding.assignment)}/latest`, oid, expected]);
    return oid;
  };
  // The attempt marker is durable before Docker starts. An interrupted process cannot silently rerun it.
  const started = await persist({binding, attempt, state: "started"}, previous?.oid ?? "0".repeat(40));
  const result = await executeDockerVerification(binding);
  const receipt = {binding, attempt, state: "completed", result};
  const oid = await persist(receipt, started);
  return {oid, receipt};
}
export async function requireVerificationReceipt(root: string, binding: VerificationBinding, receiptOid?: string) {
  const saved = receiptOid === undefined ? await readVerificationReceipt(root, binding.assignment) : await readVerificationReceiptBlob(root, receiptOid);
  return validateVerificationReceipt(binding, saved);
}

/** Authenticate an already selected receipt, independently of authoring orchestration. */
export async function validateVerificationReceipt(binding: VerificationBinding, saved: Awaited<ReturnType<typeof readVerificationReceiptBlob>> | undefined) {
  if (saved?.receipt.state !== "completed" || !saved.receipt.result || !isDeepStrictEqual(saved.receipt.binding, binding)) throw new Error("Run this exact Assignment with 'mdlm assignment run --json' before submitting verification");
  const result = saved.receipt.result;
  const current = result.sourceTree !== null && result.scriptSha256 !== null ? await authenticateVerificationSource(binding) : {};
  // Source authentication returns the same immutable fields recorded by the executor.
  for (const [key, value] of Object.entries(current)) {
    if (key in result && !isDeepStrictEqual((result as unknown as Record<string, unknown>)[key], value)) throw new Error(`Verification source binding changed: ${key}`);
  }
  return {outcome: result.outcome, receipt: `git-blob:${saved.oid}`, saved};
}

export function verificationBinding(assignment: string, packageIdentity: unknown, scenario: VersionedDefinition, dryRun: Pick<import("./scenario-dry-run.js").ScenarioDryRun, "invocations">): VerificationBinding {
  const contract = verificationContract(scenario);
  if (!contract || dryRun.invocations.length !== 1) throw new Error("Docker verification requires one declared invocation");
  const inputs = dryRun.invocations[0]!.inputs;
  const implementation = inputs.find(input => input.name === contract.implementation_input)?.values;
  const requirements = inputs.find(input => input.name === contract.requirements_input)?.values;
  if (implementation?.length !== 1 || requirements?.length !== 1) throw new Error("Docker verification requires exact implementation and requirements inputs");
  const payload = implementation[0]!.data.payload as Record<string, unknown>;
  return {assignment, package: packageIdentity, inputs: inputs.map(input => ({name: input.name, revisions: input.values.map(value => value.identity.revision_id)})), repositoryPath: payload.repository_path as string, sourceCommit: payload.source_commit as string, image: payload.verification_image as string, command: payload.verification_command as string[], scriptPath: payload.verification_script as string};
}

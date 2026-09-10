import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { canonicalReviewPacket, type AssignmentReviewContext } from "./assignment-review-context.js";
import type { VersionedDefinition } from "./index.js";

export interface ExternalReviewProof {
  contract: "mdlm-registered-review@1";
  assignment: string;
  contextSha256: string;
  packetSha256: string;
  verdictSha256: string;
  responseSha256: string;
}
interface RegisteredReview extends ExternalReviewProof {
  verdict: string;
}

export const reviewDigest = (source: string): string => createHash("sha256").update(source).digest("hex");
export function requiresExternalReview(scenario: VersionedDefinition): boolean {
  return (scenario.review_contract as { external_artifact?: unknown } | undefined)?.external_artifact === "registered-review@1";
}

async function registryFile(root: string, assignment: string): Promise<string> {
  const configured = process.env.MDLM_REVIEW_REGISTRY;
  if (!configured || !path.isAbsolute(configured)) throw new Error("MDLM_REVIEW_REGISTRY must select the manager-owned absolute registry directory at launch");
  const registry = await fs.realpath(configured);
  const repository = await fs.realpath(root);
  if (registry === repository || registry.startsWith(`${repository}${path.sep}`)) throw new Error("The review registry must be outside the lifecycle repository");
  // Assignment identity is kernel-generated; encoding also keeps this helper path-contained.
  return path.join(registry, `${encodeURIComponent(assignment)}.json`);
}

function proof(context: AssignmentReviewContext, verdict: string, response: string): ExternalReviewProof {
  return {
    contract: "mdlm-registered-review@1", assignment: context.assignment.id,
    contextSha256: reviewDigest(canonicalReviewPacket(context)),
    packetSha256: context.fullPacket.sha256,
    verdictSha256: reviewDigest(verdict), responseSha256: reviewDigest(response),
  };
}

/** Manager transport only. This role switch is not an OS identity or forgery boundary. */
export async function registerExternalReview(root: string, context: AssignmentReviewContext, verdict: string, response: string): Promise<ExternalReviewProof> {
  if (process.env.MDLM_REVIEW_REGISTRAR !== "1") throw new Error("Review registration requires the manager's MDLM_REVIEW_REGISTRAR=1 environment; authors only submit the relayed verdict");
  const binding = proof(context, verdict, response);
  const file = await registryFile(root, binding.assignment);
  const source = `${JSON.stringify({...binding, verdict})}\n`;
  const history = path.join(path.dirname(file), "artifacts");
  await fs.mkdir(history, {recursive: true});
  const artifact = path.join(history, `${reviewDigest(source)}.json`);
  try { await fs.writeFile(artifact, source, {flag: "wx", mode: 0o600}); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST" || await fs.readFile(artifact, "utf8") !== source) throw error; }
  // A corrected independently returned verdict replaces only the active pointer.
  // Prior exact artifacts remain available; lifecycle settlement consumes the lease.
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, source, {flag: "wx", mode: 0o600});
    await fs.rename(temporary, file);
  } finally { await fs.rm(temporary, {force: true}); }
  return binding;
}

/** The canonical submission boundary calls this once, before any publication. */
export async function requireExternalReview(
  root: string, context: AssignmentReviewContext, response: string,
  compile: (verdict: string) => string, authorValuesSource?: string,
): Promise<ExternalReviewProof> {
  const file = await registryFile(root, context.assignment.id);
  const registered = JSON.parse(await fs.readFile(file, "utf8")) as RegisteredReview;
  if (typeof registered.verdict !== "string") throw new Error("Registered review has no exact verdict bytes");
  const expected = proof(context, registered.verdict, compile(registered.verdict));
  for (const key of Object.keys(expected) as (keyof ExternalReviewProof)[]) {
    if (registered[key] !== expected[key]) throw new Error(`Registered review ${key} does not match the active exact review`);
  }
  if (reviewDigest(response) !== expected.responseSha256 ||
      (authorValuesSource !== undefined && reviewDigest(authorValuesSource) !== expected.verdictSha256)) {
    throw new Error("Submitted review differs from the manager-registered verdict bytes");
  }
  return expected;
}

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { executeCommandApplication } from "../../src/command-application.js";

export interface PreparedAssignment {
  outcome: Record<string, any>;
  packet: Record<string, any>;
}

export interface ProposedOutput {
  localId: string;
  name: string;
  invocation: number;
  lifecycleDatum: {
    id?: string;
    type: string;
    payload: Record<string, unknown>;
    links: { type: string; target: string }[];
    body: string;
  };
}

async function invokeCommandApplication(
  repository: string,
  arguments_: string[],
  input?: string,
) {
  const execution = await executeCommandApplication(arguments_, repository, input);
  return { status: execution.exitCode, stdout: execution.output, stderr: "" };
}

export async function prepareNextAssignment(
  repository: string,
  expectedScenario?: string,
): Promise<PreparedAssignment> {
  const next = await invokeCommandApplication(repository, ["next"]);
  if (next.status !== 0) throw new Error(`${next.stderr}${next.stdout}`);
  const outcome = JSON.parse(next.stdout);
  const assignment = outcome.assignment?.id;
  if (typeof assignment !== "string") {
    throw new Error(`Expected an Assignment, received ${next.stdout}`);
  }
  const prepared = await invokeCommandApplication(repository, ["scenario", "prepare", assignment]);
  if (prepared.status !== 0) {
    throw new Error(`${prepared.stderr}${prepared.stdout}`);
  }
  const packet = JSON.parse(prepared.stdout);
  if (expectedScenario && packet.scenario?.reference !== expectedScenario) {
    throw new Error(
      `Expected ${expectedScenario}, received ${String(packet.scenario?.reference)}`,
    );
  }
  return { outcome, packet };
}

export function assignmentResponse(
  prepared: PreparedAssignment,
  outputs: ProposedOutput[],
  completionEvidence: unknown = { summary: "Completed the exact Assignment." },
): Record<string, unknown> {
  return {
    contract: "mdlm-assignment-response@1",
    assignment: prepared.outcome.assignment.id,
    kind: "proposal",
    proposal: {
      outputs,
      completionEvidence,
      loadedSkillRefs: prepared.packet.prompt.skills.map(
        (skill: { reference: string }) => skill.reference,
      ),
      authoritySupplies: prepared.packet.authority.requirements.map(
        (requirement: { authorityRequirement: { authority: string } }) =>
          requirement.authorityRequirement.authority,
      ),
      standingDelegations: [],
    },
  };
}

export function submitAssignment(
  repository: string,
  prepared: PreparedAssignment,
  outputs: ProposedOutput[],
  completionEvidence?: unknown,
) {
  return invokeCommandApplication(
    repository,
    ["scenario", "submit"],
    `${JSON.stringify(assignmentResponse(prepared, outputs, completionEvidence))}\n`,
  );
}

export async function directoryDigest(root: string): Promise<string> {
  const hash = createHash("sha256");
  async function visit(directory: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries.sort((left, right) =>
      left.name.localeCompare(right.name)
    )) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute);
      hash.update(`${entry.isDirectory() ? "d" : "f"}:${relative}\0`);
      if (entry.isDirectory()) await visit(absolute);
      else hash.update(await fs.readFile(absolute));
    }
  }
  await visit(root);
  return hash.digest("hex");
}

export function inputRevision(
  prepared: PreparedAssignment,
  name: string,
  invocation = 0,
): string {
  const input = prepared.packet.exactInputs[invocation]?.inputs.find(
    (candidate: { name: string }) => candidate.name === name,
  );
  const revision = input?.values[0]?.identity?.revision_id;
  if (typeof revision !== "string") {
    throw new Error(`Assignment input '${name}' has no exact Revision`);
  }
  return revision;
}

export function inputRevisions(
  prepared: PreparedAssignment,
  name: string,
  invocation = 0,
): string[] {
  const input = prepared.packet.exactInputs[invocation]?.inputs.find(
    (candidate: { name: string }) => candidate.name === name,
  );
  const revisions = input?.values.map(
    (value: { identity: { revision_id?: string } }) => value.identity.revision_id,
  );
  if (!Array.isArray(revisions) || revisions.some(
    (revision: unknown) => typeof revision !== "string"
  )) {
    throw new Error(`Assignment input '${name}' has invalid exact Revisions`);
  }
  return revisions as string[];
}

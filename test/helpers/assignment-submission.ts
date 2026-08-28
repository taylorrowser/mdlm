import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
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

interface CommitOptions {
  authoritySupplies?: string[];
  commitMessage?: string;
  completionEvidence?: unknown;
}

interface CommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function requireSuccess(result: CommandResult, command: string): void {
  if (result.status !== 0) {
    throw new Error(
      `${command} exited ${String(result.status)}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
}

async function invokeCommandApplication(
  repository: string,
  arguments_: string[],
  input?: string,
) {
  const execution = await executeCommandApplication(arguments_, repository, input);
  return { status: execution.exitCode, stdout: execution.output, stderr: "" };
}

/**
 * Drives the normal successful lifecycle transaction through the command
 * application. Failure tests should keep using the lower-level helpers below.
 */
export class LifecycleTransactionDriver {
  constructor(readonly repository: string) {}

  static async initialize(repository: string): Promise<{
    driver: LifecycleTransactionDriver;
    result: Record<string, any>;
  }> {
    const initialized = await invokeCommandApplication(
      path.dirname(repository),
      ["init", repository, "--json"],
    );
    requireSuccess(initialized, "mdlm init");
    return {
      driver: new LifecycleTransactionDriver(repository),
      result: JSON.parse(initialized.stdout),
    };
  }

  async assignment(expectedScenario?: string): Promise<PreparedAssignment> {
    const next = await invokeCommandApplication(this.repository, ["next"]);
    requireSuccess(next, "mdlm next");
    const outcome = JSON.parse(next.stdout);
    if (outcome.outcome === "publication-required") {
      throw new Error(
        "mdlm next requires publication; call materialize() before assignment()",
      );
    }
    const assignment = outcome.assignment?.id;
    if (typeof assignment !== "string") {
      throw new Error(`Expected an Assignment, received ${next.stdout}`);
    }
    const prepared = await invokeCommandApplication(
      this.repository,
      ["scenario", "prepare", assignment],
    );
    requireSuccess(prepared, "mdlm scenario prepare");
    const packet = JSON.parse(prepared.stdout);
    if (expectedScenario && packet.scenario?.reference !== expectedScenario) {
      throw new Error(
        `Expected ${expectedScenario}, received ${String(packet.scenario?.reference)}`,
      );
    }
    return { outcome, packet };
  }

  async commit(
    prepared: PreparedAssignment,
    outputs: ProposedOutput[],
    options: CommitOptions = {},
  ): Promise<Record<string, any>> {
    const response = assignmentResponse(
      prepared,
      outputs,
      options.completionEvidence,
      options.authoritySupplies,
    );
    const submitted = await invokeCommandApplication(
      this.repository,
      ["scenario", "submit"],
      `${JSON.stringify(response)}\n`,
    );
    requireSuccess(submitted, "mdlm scenario submit");
    await this.doctorAndCommit(
      options.commitMessage ?? `Publish ${prepared.packet.scenario.reference}`,
    );
    return JSON.parse(submitted.stdout);
  }

  async materialize(
    commitMessage = "Publish materialized Lifecycle Data",
  ): Promise<Record<string, any>> {
    const next = await invokeCommandApplication(this.repository, ["next"]);
    requireSuccess(next, "mdlm next");
    const outcome = JSON.parse(next.stdout);
    if (
      outcome.outcome !== "publication-required" ||
      !Array.isArray(outcome.materializedExecutions) ||
      outcome.materializedExecutions.length === 0
    ) {
      throw new Error(`Expected materialized publication, received ${next.stdout}`);
    }
    await this.doctorAndCommit(commitMessage);
    return outcome;
  }

  private async doctorAndCommit(message: string): Promise<void> {
    const doctor = await invokeCommandApplication(
      this.repository,
      ["doctor", "--json"],
    );
    requireSuccess(doctor, "mdlm doctor");
    const staged = spawnSync(
      "git",
      ["-C", this.repository, "add", ".lifecycle/data"],
      { encoding: "utf8" },
    );
    requireSuccess(staged, "git add .lifecycle/data");
    const committed = spawnSync(
      "git",
      [
        "-C",
        this.repository,
        "-c",
        "user.name=MDLM Test",
        "-c",
        "user.email=mdlm-test@localhost",
        "-c",
        "commit.gpgSign=false",
        "commit",
        "--quiet",
        "--no-verify",
        "-m",
        message,
      ],
      { encoding: "utf8" },
    );
    requireSuccess(committed, "git commit");
  }
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
  authoritySupplies = prepared.packet.authority.requirements.map(
    (requirement: { authorityRequirement: { authority: string } }) =>
      requirement.authorityRequirement.authority,
  ),
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
      authoritySupplies,
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

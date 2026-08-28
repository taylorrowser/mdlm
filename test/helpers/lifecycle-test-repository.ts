import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { executeCommandApplication } from "../../src/command-application.js";
import type { ScenarioOutputProposal } from "../../src/scenario-execution.js";

export interface PreparedTestAssignment {
  outcome: Record<string, any>;
  packet: Record<string, any>;
}

interface PublishOptions {
  commitMessage?: string;
  completionEvidence?: unknown;
  authoritySupplies?: string[];
}

interface CommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function requireSuccess(result: CommandResult, command: string): void {
  if (result.status !== 0) {
    throw new Error(`${command}\n${result.stderr}${result.stdout}`);
  }
}

export class LifecycleTestRepository {
  readonly initialization: Record<string, any>;

  private constructor(
    readonly root: string,
    readonly path: string,
    initialization: Record<string, any>,
  ) {
    this.initialization = initialization;
  }

  static async create(prefix = "mdlm-lifecycle-test-"):
    Promise<LifecycleTestRepository> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    const repository = path.join(root, "repository");
    const initialized = await LifecycleTestRepository.command(
      root,
      ["init", repository, "--json"],
    );
    requireSuccess(initialized, "mdlm init");
    return new LifecycleTestRepository(
      root,
      repository,
      JSON.parse(initialized.stdout),
    );
  }

  async nextAssignment(expectedScenario?: string):
    Promise<PreparedTestAssignment> {
    const next = await LifecycleTestRepository.command(this.path, ["next"]);
    requireSuccess(next, "mdlm next");
    const outcome = JSON.parse(next.stdout);
    const assignment = outcome.assignment?.id;
    if (outcome.outcome !== "assignment" || typeof assignment !== "string") {
      throw new Error(`Expected an Assignment, received ${next.stdout}`);
    }
    const prepared = await LifecycleTestRepository.command(
      this.path,
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

  async publishMaterialization(
    commitMessage = "Publish materialized Lifecycle Data",
  ): Promise<Record<string, any>> {
    const next = await LifecycleTestRepository.command(this.path, ["next"]);
    requireSuccess(next, "mdlm next");
    const outcome = JSON.parse(next.stdout);
    if (
      outcome.outcome !== "publication-required" ||
      !Array.isArray(outcome.materializedExecutions) ||
      outcome.materializedExecutions.length === 0
    ) {
      throw new Error(`Expected materialized publication, received ${next.stdout}`);
    }
    this.commitLifecycleData(commitMessage);
    return outcome;
  }

  async publish(
    prepared: PreparedTestAssignment,
    outputs: ScenarioOutputProposal[],
    options: PublishOptions = {},
  ): Promise<Record<string, any>> {
    const authoritySupplies = options.authoritySupplies ??
      prepared.packet.authority.requirements.map(
        (requirement: { authorityRequirement: { authority: string } }) =>
          requirement.authorityRequirement.authority,
      );
    const response = {
      contract: "mdlm-assignment-response@1",
      assignment: prepared.outcome.assignment.id,
      kind: "proposal",
      proposal: {
        outputs,
        completionEvidence: options.completionEvidence ?? {
          summary: `Completed ${prepared.packet.scenario.reference}.`,
        },
        loadedSkillRefs: prepared.packet.prompt.skills.map(
          (skill: { reference: string }) => skill.reference,
        ),
        authoritySupplies,
        standingDelegations: [],
      },
    };
    const submitted = await LifecycleTestRepository.command(
      this.path,
      ["scenario", "submit"],
      `${JSON.stringify(response)}\n`,
    );
    requireSuccess(submitted, "mdlm scenario submit");
    const doctor = await LifecycleTestRepository.command(
      this.path,
      ["doctor", "--json"],
    );
    requireSuccess(doctor, "mdlm doctor");
    this.commitLifecycleData(
      options.commitMessage ?? `Publish ${prepared.packet.scenario.reference}`,
    );
    return JSON.parse(submitted.stdout);
  }

  private commitLifecycleData(message: string): void {
    requireSuccess(this.git("add", ".lifecycle/data"), "git add");
    requireSuccess(
      this.git(
        "-c", "user.name=MDLM Test",
        "-c", "user.email=mdlm-test@localhost",
        "-c", "commit.gpgSign=false",
        "commit", "--quiet", "--no-verify", "-m", message,
      ),
      "git commit",
    );
  }

  private git(...arguments_: string[]) {
    return spawnSync("git", ["-C", this.path, ...arguments_], {
      encoding: "utf8",
    });
  }

  async dispose(): Promise<void> {
    await fs.rm(this.root, { recursive: true, force: true });
  }

  private static async command(
    cwd: string,
    arguments_: string[],
    input?: string,
  ): Promise<CommandResult> {
    const execution = await executeCommandApplication(arguments_, cwd, input);
    return { status: execution.exitCode, stdout: execution.output, stderr: "" };
  }
}

export async function withLifecycleTestRepository<T>(
  prefix: string,
  run: (repository: LifecycleTestRepository) => Promise<T>,
): Promise<T> {
  const repository = await LifecycleTestRepository.create(prefix);
  try {
    return await run(repository);
  } finally {
    await repository.dispose();
  }
}

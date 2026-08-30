import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "vitest";
import { parse, stringify } from "yaml";
import { executeCommandApplication } from "../src/command-application.js";
import { initializeRepositoryFromProcessPackage } from
  "../src/repository-initialization.js";

const processRoot = path.join(process.cwd(), ".lifecycle/process");
async function mdlm(
  repository: string,
  arguments_: string[],
  input?: string,
): Promise<Record<string, any>> {
  const result = await executeCommandApplication(arguments_, repository, input);
  expect(result.exitCode, result.output).toBe(0);
  return JSON.parse(result.output);
}

async function installPilotControlAssignment(packageRoot: string): Promise<void> {
  const scenarioPath = path.join(
    packageRoot,
    "scenarios/establish-initial-wayfinding-map.yaml",
  );
  const scenario = parse(await fs.readFile(scenarioPath, "utf8"));
  scenario.description = "Publish one disposable pilot control for a public schema regression.";
  scenario.outputs = [{
    name: "target",
    types: ["ART"],
    cardinality: "one",
    required_links: [],
  }];
  scenario.completion = [
    "execution.integrity.contract_valid == true",
    'target.payload.kind == "prototype"',
    'target.payload.prototype_controls.known_good.argv == ["node", "-e", "process.exit(0)", ""]',
    'target.payload.prototype_controls.known_bad.argv == ["node", "-e", "process.exit(1)", ""]',
  ].join(" && ");
  scenario.prohibited_inputs = [];
  await fs.writeFile(scenarioPath, stringify(scenario));
}

function exactObservation(exitStatus: number) {
  return {
    exit_status: exitStatus,
    stdout: { encoding: "base64", bytes: "" },
    stderr: { encoding: "base64", bytes: "" },
  };
}

function expectExactArgvBoundary(
  projected: Record<string, any>,
  objectName: string,
  controlName: string,
): void {
  expect(
    projected.schema.flattenedPayloadSchema.properties[objectName]
      .properties[controlName].properties.argv,
  ).toEqual({
    type: "array",
    minItems: 1,
    prefixItems: [{ type: "string", minLength: 1, pattern: "^[^/\\\\]+$" }],
    items: { type: "string" },
  });
}

export async function runPilotControlEmptyArgvPublic(): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-empty-argv-"));
  try {
    const packageRoot = path.join(root, "package");
    const repository = path.join(root, "repository");
    await fs.cp(processRoot, packageRoot, { recursive: true });
    await installPilotControlAssignment(packageRoot);
    const initialized = await initializeRepositoryFromProcessPackage(
      repository,
      packageRoot,
    );
    expect(initialized.ok, initialized.ok ? "" : JSON.stringify(initialized.diagnostics))
      .toBe(true);
    if (!initialized.ok) return;

    const next = await mdlm(repository, ["next", "--json"]);
    const packet = next.assignment.packet;
    expect(packet.scenario.reference).toBe("establish-initial-wayfinding-map@2");
    const response = structuredClone(packet.responseScaffold);
    const target = response.proposal.outputs.find(
      (output: { handle: string }) => output.handle === "target",
    );
    target.payload = {
      title: "Empty argument pilot controls",
      kind: "prototype",
      supported_behavior: ["Accept one empty argument token."],
      unsupported_behavior: ["Reject the one-fault control."],
      prototype_controls: {
        activity_ref: "VER-5240000001-r00001",
        working_directory: "fresh-temporary-directory",
        known_good: {
          argv: ["node", "-e", "process.exit(0)", ""],
          expected_observation: exactObservation(0),
          expected_verification_outcome: "pass",
        },
        known_bad: {
          argv: ["node", "-e", "process.exit(1)", ""],
          expected_observation: exactObservation(1),
          expected_verification_outcome: "fail",
          fault: "The control exits one instead of zero.",
        },
      },
    };
    target.body = "The fourth argv token is intentionally empty.\n";

    const submitted = await mdlm(
      repository,
      ["scenario", "submit", "-", "--json"],
      `${JSON.stringify(response)}\n`,
    );
    const publication = submitted.receipt.publications.find(
      (output: { handle: string }) => output.handle === "target",
    );
    const shown = await mdlm(repository, [
      "show",
      publication.revisionId,
      "--json",
    ]);
    expect(shown.lifecycleDatum.datum.payload.prototype_controls).toMatchObject({
      known_good: { argv: ["node", "-e", "process.exit(0)", ""] },
      known_bad: { argv: ["node", "-e", "process.exit(1)", ""] },
    });

    const projections = await Promise.all([
      mdlm(repository, ["schema", "ART", "--json"]),
      mdlm(repository, ["schema", "VAI", "--json"]),
      mdlm(repository, ["schema", "RUN", "--json"]),
    ]);
    for (const [projected, objectName] of projections.map((item, index) => [
      item,
      ["prototype_controls", "prototype_control_bindings", "control_observations"][index],
    ] as const)) {
      expectExactArgvBoundary(projected, objectName!, "known_good");
      expectExactArgvBoundary(projected, objectName!, "known_bad");
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

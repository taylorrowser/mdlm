import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporaryRoots: string[] = [];

function run(command: string, arguments_: string[], cwd: string, input?: string) {
  return spawnSync(command, arguments_, {
    cwd,
    encoding: "utf8",
    input,
    maxBuffer: 20 * 1024 * 1024,
  });
}

function successful(result: ReturnType<typeof run>, command: string) {
  expect(result.status, `${command}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`).toBe(0);
  return JSON.parse(result.stdout) as Record<string, any>;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    fs.rm(root, { recursive: true, force: true })
  ));
});

describe("installed v2 cutover journey", () => {
  it("runs one fresh Phase 0 next and atomic submit through the packed CLI", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-installed-cutover-"));
    temporaryRoots.push(root);
    const packageRoot = path.join(root, "package");
    const installRoot = path.join(root, "install");
    const repository = path.join(root, "product");
    await fs.mkdir(packageRoot, { recursive: true });

    const packed = run("npm", ["pack", "--pack-destination", packageRoot, "--silent"], process.cwd());
    expect(packed.status, packed.stderr).toBe(0);
    const archive = path.join(packageRoot, packed.stdout.trim().split("\n").at(-1)!);
    const installed = run(
      "npm",
      ["install", "--prefix", installRoot, "--ignore-scripts", "--offline", archive],
      process.cwd(),
    );
    expect(installed.status, installed.stderr).toBe(0);
    const executable = path.join(installRoot, "node_modules/mdlm/dist/mdlm.js");

    const initialized = successful(
      run(process.execPath, [executable, "init", repository, "--json"], root),
      "installed mdlm init",
    );
    expect(initialized.package.reference).toBe("mdlm-bootstrap@0.81.0");

    const next = successful(
      run(process.execPath, [executable, "next", "--json"], repository),
      "installed mdlm next",
    );
    expect(next).toMatchObject({
      contract: "mdlm-next@2",
      outcome: "assignment",
      assignment: { packet: { contract: "mdlm-assignment-packet@3" } },
    });
    const scaffold = next.assignment.packet.responseScaffold;
    const payloads: Record<string, Record<string, unknown>> = {
      map: {
        title: "Initial product wayfinding map",
        purpose: "Index the exact questions that bound the initial product intent.",
        frontier: ["product-intent"],
      },
      product_intent: {
        title: "Intended product",
        kind: "preferential",
        intent_scope: "product",
        question: "What product do you currently intend to build?",
        state: "open",
        blocking_impact: "PSP compilation waits for the stakeholder answer.",
      },
      questions: {
        title: "Initial empirical boundary",
        kind: "empirical",
        question: "Which repository evidence is relevant to the intended product?",
        state: "open",
        blocking_impact: "No product claim is inferred from repository evidence.",
      },
    };
    const response = {
      ...scaffold,
      proposal: {
        ...scaffold.proposal,
        outputs: scaffold.proposal.outputs.map((output: Record<string, unknown>) => ({
          ...output,
          payload: payloads[String(output.handle)],
          body: `# ${String(output.handle)}\n`,
        })),
      },
    };
    const submitted = successful(
      run(
        process.execPath,
        [executable, "scenario", "submit", "-", "--json"],
        repository,
        `${JSON.stringify(response)}\n`,
      ),
      "installed mdlm scenario submit",
    );
    expect(submitted).toMatchObject({
      contract: "mdlm-submission-outcome@1",
      outcome: "accepted",
      assignment: { id: next.assignment.id },
    });
    expect(submitted).not.toHaveProperty("orchestration");
    expect(submitted.receipt.publications).toHaveLength(3);
    expect(submitted.settlement.execution).toEqual(expect.any(String));
  }, 180_000);
});

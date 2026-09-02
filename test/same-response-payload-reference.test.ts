import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse, stringify } from "yaml";
import { expect, it } from "vitest";
import { executeCommandApplication } from "../src/command-application.js";
import { selectProcessPackageFixture } from "./helpers/mdlm.js";
import { terminalProcessPackage } from "./helpers/terminal-process-package.js";

type Json = Record<string, any>;

async function command(repository: string, arguments_: string[], input?: string) {
  const result = await executeCommandApplication(arguments_, repository, input);
  return { status: result.exitCode, value: JSON.parse(result.output) as Json };
}

async function writeYaml(root: string, relativePath: string, value: unknown) {
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, stringify(value));
}

it("publishes a payload reference to a same-response generated Revision", async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-payload-reference-"));
  try {
    const processRoot = await terminalProcessPackage(parent);
    const manifestPath = path.join(processRoot, "manifest.yaml");
    const manifest = parse(await fs.readFile(manifestPath, "utf8"));
    delete manifest.catalog;
    delete manifest.assets;
    await writeYaml(processRoot, "manifest.yaml", manifest);

    await writeYaml(processRoot, "types/VAI.yaml", {
      kind: "type-definition",
      id: "VAI",
      version: 1,
      name: "Verification Activity Implementation",
      description: "A source-blind verification procedure.",
      extends: "terminal-datum@1",
      lifecycle: { authorship: "authored", freeze_when: "explicit" },
      payload_schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        additionalProperties: false,
        required: ["kind"],
        properties: { kind: { const: "pilot" } },
      },
      outgoing_links: [],
      kernel_managed_payload_paths: [],
    });
    await writeYaml(processRoot, "types/DEC.yaml", {
      kind: "type-definition",
      id: "DEC",
      version: 1,
      name: "Authorization Decision",
      description: "Authorization for one exact generated procedure Revision.",
      extends: "terminal-datum@1",
      lifecycle: { authorship: "authored", freeze_when: "explicit" },
      payload_schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        additionalProperties: false,
        required: ["kind", "effective_scope"],
        properties: {
          kind: { const: "decision" },
          effective_scope: { type: "string", minLength: 1 },
        },
      },
      outgoing_links: [{
        id: "justifies",
        description: "The exact generated procedure authorized by this Decision.",
        targets: [{ kind: "datum", types: ["VAI"], identity: "revision" }],
        cardinality: { minimum: 1, maximum: 1 },
        freeze_resolution: "already-exact",
        inverse_label: "justified-by",
      }],
      kernel_managed_payload_paths: [],
    });
    await writeYaml(processRoot, "selectors/authorization-evidence.yaml", {
      kind: "selector-definition",
      id: "authorization-evidence",
      version: 1,
      description: "Select the generated authorization Decision.",
      parameters: [],
      result_kind: "revision",
      query: {
        from: { collection: "revisions", types: ["DEC"] },
        as: "decision",
        distinct: true,
        order_by: ["identity.revision_id"],
      },
    });

    const obligationPath = path.join(processRoot, "obligations/terminal-check.yaml");
    const obligation = parse(await fs.readFile(obligationPath, "utf8"));
    obligation.satisfied_when = 'exists("authorization-evidence@1", {})';
    obligation.resolve_with.scenario = "implement-verification-activity@1";
    await writeYaml(processRoot, "obligations/terminal-check.yaml", obligation);
    await writeYaml(processRoot, "scenarios/implement-verification-activity.yaml", {
      kind: "scenario-definition",
      id: "implement-verification-activity",
      version: 1,
      description: "Publish one procedure and its exact authorization.",
      phases: ["phase-0-terminal"],
      inputs: [],
      outputs: [{
        name: "implementation",
        types: ["VAI"],
        cardinality: "one",
        required_links: [],
      }, {
        name: "authorization",
        types: ["DEC"],
        cardinality: "one",
        required_payload: {
          kind: "decision",
          effective_scope: "$proposal.implementation.revision_id",
        },
        required_links: [{
          link: "justifies",
          target: { output: "implementation" },
        }],
      }],
      prompt_ref: "prompts/implement-verification-activity.md@1",
      review_policy_ref: "no-waiver@1",
      completion: 'execution.integrity.contract_valid == true && authorization.payload.effective_scope == implementation.identity.revision_id',
      resolves: ["terminal-check"],
      prohibited_inputs: [],
      batching: "single",
    });
    await fs.writeFile(
      path.join(processRoot, "prompts/implement-verification-activity.md"),
      "---\nid: implement-verification-activity\nversion: 1\nscenario: implement-verification-activity\n---\n\n# Implement verification activity\n",
    );

    const phasePath = path.join(processRoot, "phases/phase-0-terminal.yaml");
    const phase = parse(await fs.readFile(phasePath, "utf8"));
    delete phase.scenarios;
    delete phase.obligations;
    phase.routing = {
      eligible_when: "dispatchable",
      status_order: ["ready", "awaiting-review", "failed", "stale", "blocked"],
      tie_breakers: ["subject", "obligation"],
    };
    phase.outputs = ["VAI", "DEC"];
    await writeYaml(processRoot, "phases/phase-0-terminal.yaml", phase);
    const profilePath = path.join(processRoot, "profiles/terminal.yaml");
    const profile = parse(await fs.readFile(profilePath, "utf8"));
    profile.enabled.types = ["VAI", "DEC"];
    await writeYaml(processRoot, "profiles/terminal.yaml", profile);

    const repository = path.join(parent, "repository");
    await fs.mkdir(repository);
    await selectProcessPackageFixture(repository, processRoot);

    const prepared = await command(repository, ["next", "--json"]);
    expect(prepared.status, JSON.stringify(prepared.value)).toBe(0);
    expect(prepared.value.assignment.packet.scenario.reference)
      .toBe("implement-verification-activity@1");
    const response = structuredClone(
      prepared.value.assignment.packet.responseScaffold,
    );
    const implementation = response.proposal.outputs.find(
      (output: Json) => output.handle === "implementation",
    );
    const authorization = response.proposal.outputs.find(
      (output: Json) => output.handle === "authorization",
    );
    expect(prepared.value.assignment.packet.outputs.find(
      (output: Json) => output.handle === "authorization",
    ).payloadSummary.requiredValues).toEqual({
      kind: "decision",
      effective_scope: { output: "implementation" },
    });
    expect(authorization.links).toEqual([{
      type: "justifies",
      target: { output: "implementation" },
    }]);
    implementation.payload = { kind: "pilot" };
    implementation.body = "The source-blind procedure.\n";
    expect(authorization.payload).toMatchObject({
      kind: "decision",
      effective_scope: { output: "implementation" },
    });
    authorization.body = "Authorization for the exact procedure Revision.\n";
    response.proposal.completionEvidence = { summary: "Authorized exact procedure." };

    const wrongScope = structuredClone(response);
    wrongScope.proposal.outputs.find(
      (output: Json) => output.handle === "authorization",
    ).payload.effective_scope = "VAI-NOT-THE-GENERATED-REVISION-r00001";
    const rejected = await command(
      repository,
      ["scenario", "submit", "-", "--json"],
      `${JSON.stringify(wrongScope)}\n`,
    );
    expect(rejected.status, JSON.stringify(rejected.value)).toBe(1);
    expect(rejected.value).toMatchObject({
      outcome: "rejected",
      correctionConsumed: false,
      diagnostics: [expect.objectContaining({
        code: "scenario-output-required-payload-invalid",
      })],
    });

    const submitted = await command(
      repository,
      ["scenario", "submit", "-", "--json"],
      `${JSON.stringify(response)}\n`,
    );
    expect(submitted.status, JSON.stringify(submitted.value)).toBe(0);
    const publications = submitted.value.receipt.publications;
    const publishedImplementation = publications.find(
      (publication: Json) => publication.handle === "implementation",
    );
    const publishedAuthorization = publications.find(
      (publication: Json) => publication.handle === "authorization",
    );
    const shownAuthorization = await command(
      repository,
      ["show", publishedAuthorization.revisionId, "--json"],
    );
    expect(shownAuthorization.status, JSON.stringify(shownAuthorization.value)).toBe(0);
    expect(shownAuthorization.value.lifecycleDatum.datum.payload.effective_scope)
      .toBe(publishedImplementation.revisionId);
    expect(shownAuthorization.value.lifecycleDatum.datum.links).toEqual([{
      type: "justifies",
      target: publishedImplementation.revisionId,
    }]);

    const doctor = await command(repository, ["doctor", "--json"]);
    expect(doctor.status, JSON.stringify(doctor.value)).toBe(0);
    expect(doctor.value.diagnostics).toEqual([]);
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
});

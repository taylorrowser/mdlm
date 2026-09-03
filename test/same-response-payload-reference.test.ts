import { spawnSync } from "node:child_process";
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

function commit(repository: string, message: string) {
  for (const arguments_ of [
    ["add", ".lifecycle"],
    [
      "-c", "user.name=MDLM Test",
      "-c", "user.email=mdlm-test@localhost",
      "-c", "commit.gpgSign=false",
      "commit", "--quiet", "--no-verify", "-m", message,
    ],
  ]) {
    const result = spawnSync("git", ["-C", repository, ...arguments_], {
      encoding: "utf8",
    });
    expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
  }
}

it("publishes payload references to generated and exact input Revisions", async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-payload-reference-"));
  try {
    const processRoot = await terminalProcessPackage(parent);
    const manifestPath = path.join(processRoot, "manifest.yaml");
    const manifest = parse(await fs.readFile(manifestPath, "utf8"));
    delete manifest.catalog;
    delete manifest.assets;
    await writeYaml(processRoot, "manifest.yaml", manifest);
    const componentPromotion = parse(await fs.readFile(
      path.join(
        process.cwd(),
        ".lifecycle/process/scenarios/promote-component-after-design-gate.yaml",
      ),
      "utf8",
    ));
    const designAcceptance = parse(await fs.readFile(
      path.join(
        process.cwd(),
        ".lifecycle/process/scenarios/accept-phase-2-system.yaml",
      ),
      "utf8",
    ));
    const componentRequiredPayload = componentPromotion.outputs[0]
      .required_payload;
    expect(componentRequiredPayload).toEqual({
      scope: "$input.component_candidate.payload.scope",
      group: "$input.component_candidate.payload.group",
    });
    expect(designAcceptance.outputs[0].required_payload).toEqual({
      scope: "$input.candidate.payload.scope",
      group: "$input.candidate.payload.group",
    });

    await writeYaml(processRoot, "types/DWP.yaml", {
      kind: "type-definition",
      id: "DWP",
      version: 1,
      name: "Definition Work Package",
      description: "One completed lower-level definition package.",
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
        required: ["kind", "effective_scope", "binding"],
        properties: {
          kind: { const: "decision" },
          effective_scope: { type: "string", minLength: 1 },
          binding: {
            type: "object",
            additionalProperties: false,
            required: ["generated_scope"],
            properties: {
              generated_scope: { type: "string", minLength: 1 },
            },
          },
        },
      },
      outgoing_links: [{
        id: "justifies",
        description: "The exact generated procedure authorized by this Decision.",
        targets: [{ kind: "datum", types: ["DWP"], identity: "revision" }],
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
    await writeYaml(processRoot, "types/BSL.yaml", {
      kind: "type-definition",
      id: "BSL",
      version: 1,
      name: "Baseline",
      description: "One frozen definition-level candidate.",
      extends: "terminal-datum@1",
      lifecycle: { authorship: "authored", freeze_when: "explicit" },
      payload_schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        additionalProperties: false,
        required: ["kind", "role", "scope", "group"],
        properties: {
          kind: { enum: ["level-candidate", "level-accepted"] },
          role: { enum: ["candidate", "accepted"] },
          scope: { type: "string", minLength: 1 },
          group: { type: "string", minLength: 1 },
        },
      },
      outgoing_links: [{
        id: "promotes",
        description: "The exact candidate promoted by this baseline.",
        targets: [{ kind: "datum", types: ["BSL"], identity: "revision" }],
        cardinality: { minimum: 0, maximum: 1 },
        freeze_resolution: "already-exact",
        inverse_label: "promoted-by",
      }],
      kernel_managed_payload_paths: [],
    });
    await writeYaml(processRoot, "selectors/definition-candidates.yaml", {
      kind: "selector-definition",
      id: "definition-candidates",
      version: 1,
      description: "Select published definition-level candidates.",
      parameters: [],
      result_kind: "revision",
      query: {
        from: { collection: "revisions", types: ["BSL"] },
        as: "candidate",
        distinct: true,
        order_by: ["identity.revision_id"],
      },
    });
    await writeYaml(processRoot, "selectors/definition-completions.yaml", {
      kind: "selector-definition",
      id: "definition-completions",
      version: 1,
      description: "Select completed definition packages.",
      parameters: [],
      result_kind: "revision",
      query: {
        from: { collection: "revisions", types: ["DWP"] },
        as: "completion",
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
        types: ["DWP"],
        cardinality: "one",
        required_links: [],
      }, {
        name: "authorization",
        types: ["DEC"],
        cardinality: "one",
        required_payload: {
          kind: "decision",
          effective_scope: "$proposal.implementation.revision_id",
          "binding.generated_scope": "$proposal.implementation.revision_id",
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
    await writeYaml(processRoot, "scenarios/create-definition-level-candidate.yaml", {
      kind: "scenario-definition",
      id: "create-definition-level-candidate",
      version: 1,
      description: "Freeze one completed definition package as a candidate.",
      phases: ["phase-0-terminal"],
      inputs: [{
        name: "completion",
        types: ["DWP"],
        cardinality: "one",
        identity: "revision",
      }],
      outputs: [{
        name: "candidate",
        types: ["BSL"],
        cardinality: "one",
        required_links: [],
        required_payload: {
          kind: "level-candidate",
          role: "candidate",
          scope: "$input.completion.revision_id",
          group: "DEFAULT",
        },
      }],
      prompt_ref: "prompts/create-definition-level-candidate.md@1",
      review_policy_ref: "no-waiver@1",
      completion: "execution.integrity.contract_valid == true",
      resolves: ["definition-candidate"],
      prohibited_inputs: [],
      batching: "single",
    });
    await writeYaml(
      processRoot,
      "scenarios/promote-component-after-design-gate.yaml",
      {
        kind: "scenario-definition",
        id: "promote-component-after-design-gate",
        version: 1,
        description: "Promote the exact candidate without another authority step.",
        phases: ["phase-0-terminal"],
        inputs: [{
          name: "component_candidate",
          types: ["BSL"],
          cardinality: "one",
          identity: "revision",
        }],
        outputs: [{
          name: "accepted",
          types: ["BSL"],
          cardinality: "one",
          required_payload: componentRequiredPayload,
          required_links: [{
            link: "promotes",
            target: { input: "component_candidate" },
          }],
        }],
        prompt_ref: "prompts/promote-component-after-design-gate.md@1",
        review_policy_ref: "no-waiver@1",
        completion: "execution.integrity.contract_valid == true",
        resolves: ["accepted-component-required"],
        prohibited_inputs: [],
        batching: "single",
      },
    );
    await fs.writeFile(
      path.join(processRoot, "prompts/implement-verification-activity.md"),
      "---\nid: implement-verification-activity\nversion: 1\nscenario: implement-verification-activity\n---\n\n# Implement verification activity\n",
    );
    await fs.writeFile(
      path.join(processRoot, "prompts/create-definition-level-candidate.md"),
      "---\nid: create-definition-level-candidate\nversion: 1\nscenario: create-definition-level-candidate\n---\n\n# Create definition-level candidate\n",
    );
    await fs.writeFile(
      path.join(processRoot, "prompts/promote-component-after-design-gate.md"),
      "---\nid: promote-component-after-design-gate\nversion: 1\nscenario: promote-component-after-design-gate\n---\n\n# Promote candidate\n",
    );
    await writeYaml(processRoot, "obligations/definition-candidate.yaml", {
      kind: "obligation-definition",
      id: "definition-candidate",
      version: 1,
      description: "Require a candidate for the completed definition package.",
      phases: ["phase-0-terminal"],
      for_each: 'select("definition-completions@1", {})',
      subject_as: "completion",
      satisfied_when: 'exists("definition-candidates@1", {})',
      status_rules: [{
        status: "ready",
        priority: 1,
        when: "true",
        reason: "Freeze the completed definition package.",
      }],
      default_status: "blocked",
      resolve_with: {
        scenario: "create-definition-level-candidate@1",
        inputs: { completion: "completion" },
      },
      waiver_policy_ref: "no-waiver@1",
    });
    await writeYaml(processRoot, "obligations/accepted-component-required.yaml", {
      kind: "obligation-definition",
      id: "accepted-component-required",
      version: 1,
      description: "Promote each exact candidate.",
      phases: ["phase-0-terminal"],
      for_each: 'select("definition-candidates@1", {})',
      subject_as: "component_candidate",
      satisfied_when: "false",
      status_rules: [{
        status: "ready",
        priority: 1,
        when: "true",
        reason: "Promote the exact candidate.",
      }],
      default_status: "blocked",
      resolve_with: {
        scenario: "promote-component-after-design-gate@1",
        inputs: { component_candidate: "component_candidate" },
      },
      waiver_policy_ref: "no-waiver@1",
    });

    const phasePath = path.join(processRoot, "phases/phase-0-terminal.yaml");
    const phase = parse(await fs.readFile(phasePath, "utf8"));
    delete phase.scenarios;
    delete phase.obligations;
    phase.routing = {
      eligible_when: "dispatchable",
      status_order: ["ready", "awaiting-review", "failed", "stale", "blocked"],
      tie_breakers: ["subject", "obligation"],
    };
    phase.outputs = ["DWP", "DEC", "BSL"];
    await writeYaml(processRoot, "phases/phase-0-terminal.yaml", phase);
    const profilePath = path.join(processRoot, "profiles/terminal.yaml");
    const profile = parse(await fs.readFile(profilePath, "utf8"));
    profile.enabled.types = ["DWP", "DEC", "BSL"];
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
      "binding.generated_scope": { output: "implementation" },
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
      binding: { generated_scope: { output: "implementation" } },
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
    commit(repository, "Publish completed definition package");

    const candidatePrepared = await command(repository, ["next", "--json"]);
    expect(candidatePrepared.status, JSON.stringify(candidatePrepared.value)).toBe(0);
    const candidatePacket = candidatePrepared.value.assignment.packet;
    expect(candidatePacket.scenario.reference)
      .toBe("create-definition-level-candidate@1");
    const completionRevision = candidatePacket.exactInputs[0].inputs[0]
      .values[0].identity.revision_id;
    expect(completionRevision).toBe(publishedImplementation.revisionId);
    const candidateResponse = structuredClone(candidatePacket.responseScaffold);
    const candidate = candidateResponse.proposal.outputs[0];
    expect(candidate.payload).toEqual({
      kind: "level-candidate",
      role: "candidate",
      scope: completionRevision,
      group: "DEFAULT",
    });
    expect(candidatePacket.outputs[0].payloadSummary.requiredValues).toEqual({
      kind: "level-candidate",
      role: "candidate",
      scope: { input: "completion", identity: "revision_id" },
      group: "DEFAULT",
    });
    candidate.body = "Candidate for the exact completed definition package.\n";
    candidateResponse.proposal.completionEvidence = {
      summary: "Froze the exact completed definition package.",
    };

    const wrongCandidate = structuredClone(candidateResponse);
    wrongCandidate.proposal.outputs[0].payload.scope =
      "DWP-NOT-THE-COMPLETION-r00001";
    wrongCandidate.proposal.outputs[0].payload.group = "PHASE-3-COMPONENT";
    const candidateRejected = await command(
      repository,
      ["scenario", "submit", "-", "--json"],
      `${JSON.stringify(wrongCandidate)}\n`,
    );
    expect(candidateRejected.status, JSON.stringify(candidateRejected.value)).toBe(1);
    expect(candidateRejected.value).toMatchObject({
      outcome: "rejected",
      correctionConsumed: false,
    });
    expect(candidateRejected.value.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "scenario-output-required-payload-invalid",
        path: expect.stringContaining("payload.scope"),
      }),
      expect.objectContaining({
        code: "scenario-output-required-payload-invalid",
        path: expect.stringContaining("payload.group"),
      }),
    ]));

    const candidateSubmitted = await command(
      repository,
      ["scenario", "submit", "-", "--json"],
      `${JSON.stringify(candidateResponse)}\n`,
    );
    expect(candidateSubmitted.status, JSON.stringify(candidateSubmitted.value)).toBe(0);
    commit(repository, "Publish exact promotion candidate");

    const promotionPrepared = await command(repository, ["next", "--json"]);
    expect(promotionPrepared.status, JSON.stringify(promotionPrepared.value)).toBe(0);
    const promotionPacket = promotionPrepared.value.assignment.packet;
    expect(promotionPacket.scenario.reference)
      .toBe("promote-component-after-design-gate@1");
    const candidatePayload = promotionPacket.exactInputs[0].inputs[0]
      .values[0].data.payload;
    expect(promotionPacket.outputs[0].payloadSummary.requiredValues).toEqual({
      scope: { input: "component_candidate", payload: "scope" },
      group: { input: "component_candidate", payload: "group" },
    });
    const promotionResponse = structuredClone(promotionPacket.responseScaffold);
    expect(promotionResponse.proposal.outputs[0].payload).toMatchObject({
      scope: candidatePayload.scope,
      group: candidatePayload.group,
    });
    promotionResponse.proposal.outputs[0].payload.kind = "level-accepted";
    promotionResponse.proposal.outputs[0].payload.role = "accepted";
    promotionResponse.proposal.outputs[0].body = "The accepted candidate.\n";
    promotionResponse.proposal.completionEvidence = {
      summary: "Promoted the exact candidate.",
    };

    const wrongPromotion = structuredClone(promotionResponse);
    wrongPromotion.proposal.outputs[0].payload.scope = "ARBITRARY-SCOPE";
    wrongPromotion.proposal.outputs[0].payload.group = "ARBITRARY-GROUP";
    const promotionRejected = await command(
      repository,
      ["scenario", "submit", "-", "--json"],
      `${JSON.stringify(wrongPromotion)}\n`,
    );
    expect(promotionRejected.status, JSON.stringify(promotionRejected.value)).toBe(1);
    expect(promotionRejected.value).toMatchObject({
      outcome: "rejected",
      correctionConsumed: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: "scenario-output-required-payload-invalid",
          path: expect.stringContaining("payload.scope"),
        }),
        expect.objectContaining({
          code: "scenario-output-required-payload-invalid",
          path: expect.stringContaining("payload.group"),
        }),
      ]),
    });
    const promotionSubmitted = await command(
      repository,
      ["scenario", "submit", "-", "--json"],
      `${JSON.stringify(promotionResponse)}\n`,
    );
    expect(promotionSubmitted.status, JSON.stringify(promotionSubmitted.value)).toBe(0);

    const doctor = await command(repository, ["doctor", "--json"]);
    expect(doctor.status, JSON.stringify(doctor.value)).toBe(0);
    expect(doctor.value.diagnostics).toEqual([]);
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
});

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

it("renders and validates repeated and batched symbolic outputs", async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-repeated-output-"));
  try {
    const processRoot = await terminalProcessPackage(parent);
    const manifestPath = path.join(processRoot, "manifest.yaml");
    const manifest = parse(await fs.readFile(manifestPath, "utf8"));
    delete manifest.catalog;
    delete manifest.assets;
    await writeYaml(processRoot, "manifest.yaml", manifest);

    const itemTypePath = path.join(processRoot, "types/ITM.yaml");
    const groupType = parse(await fs.readFile(itemTypePath, "utf8"));
    Object.assign(groupType, {
      id: "GRP",
      name: "Fixture Group",
      description: "A generic partition of supplied fixture items.",
      outgoing_links: [{
        id: "covers",
        description: "Exact fixture items assigned to this group.",
        targets: [{ kind: "datum", types: ["ITM"], identity: "revision" }],
        cardinality: { minimum: 1, maximum: "many" },
        freeze_resolution: "already-exact",
        inverse_label: "covered-by",
      }, {
        id: "asks",
        description: "Optional questions raised by this group.",
        targets: [{ kind: "datum", types: ["ITM"], identity: "revision" }],
        cardinality: { minimum: 0, maximum: "many" },
        freeze_resolution: "already-exact",
        inverse_label: "asked-by",
      }],
    });
    await writeYaml(processRoot, "types/GRP.yaml", groupType);

    const seedScenarioPath = path.join(
      processRoot,
      "scenarios/record-terminal-item.yaml",
    );
    const seedScenario = parse(await fs.readFile(seedScenarioPath, "utf8"));
    seedScenario.outputs = [{
      name: "items",
      handle: "item",
      types: ["ITM"],
      cardinality: "one-or-more",
      required_links: [],
    }];
    await writeYaml(processRoot, "scenarios/record-terminal-item.yaml", seedScenario);

    const seedObligationPath = path.join(
      processRoot,
      "obligations/terminal-check.yaml",
    );
    const seedObligation = parse(await fs.readFile(seedObligationPath, "utf8"));
    seedObligation.satisfied_when = 'count("terminal-evidence@1", {}) >= 2';
    await writeYaml(processRoot, "obligations/terminal-check.yaml", seedObligation);
    await writeYaml(processRoot, "selectors/partitioned-groups.yaml", {
      kind: "selector-definition",
      id: "partitioned-groups",
      version: 1,
      description: "Select published fixture groups.",
      parameters: [],
      result_kind: "revision",
      query: {
        from: { collection: "revisions", types: ["GRP"] },
        as: "group",
        distinct: true,
        order_by: ["identity.revision_id"],
      },
    });
    await writeYaml(processRoot, "scenarios/partition-items.yaml", {
      kind: "scenario-definition",
      id: "partition-items",
      version: 1,
      description: "Partition every supplied item across one or more groups.",
      phases: ["phase-0-terminal"],
      inputs: [{
        name: "items",
        types: ["ITM"],
        cardinality: "one-or-more",
        identity: "revision",
      }],
      outputs: [{
        name: "groups",
        handle: "group",
        types: ["GRP"],
        cardinality: "one-or-more",
        required_links: [{
          link: "covers",
          target: { input: "items" },
          distribution: "partition",
        }, {
          link: "asks",
          target: { output: "questions" },
        }],
      }, {
        name: "questions",
        types: ["ITM"],
        cardinality: "zero-or-more",
        required_links: [],
      }],
      prompt_ref: "prompts/partition-items.md@1",
      review_policy_ref: "no-waiver@1",
      completion: "execution.integrity.contract_valid == true",
      resolves: ["partition-check"],
      prohibited_inputs: [],
      batching: "coherent-batch",
    });
    await fs.writeFile(
      path.join(processRoot, "prompts/partition-items.md"),
      "---\nid: partition-items\nversion: 1\nscenario: partition-items\n---\n\n# Partition fixture items\n",
    );
    await writeYaml(processRoot, "obligations/partition-check.yaml", {
      kind: "obligation-definition",
      id: "partition-check",
      version: 1,
      description: "Require one exact partition of the fixture items.",
      phases: ["phase-0-terminal"],
      for_each: "[phase]",
      subject_as: "terminal_scope",
      satisfied_when: 'exists("partitioned-groups@1", {})',
      status_rules: [{
        status: "ready",
        priority: 1,
        when: 'count("terminal-evidence@1", {}) >= 2',
        reason: "Partition the exact fixture items.",
      }],
      default_status: "blocked",
      resolve_with: {
        scenario: "partition-items@1",
        inputs: { items: 'select("terminal-evidence@1", {})' },
      },
      waiver_policy_ref: "no-waiver@1",
    });
    const itemType = parse(await fs.readFile(itemTypePath, "utf8"));
    itemType.outgoing_links = [{
        id: "reviews",
        description: "Exact fixture group reviewed by this audit.",
        targets: [{ kind: "datum", types: ["GRP"], identity: "revision" }],
        cardinality: { minimum: 0, maximum: 1 },
        freeze_resolution: "already-exact",
        inverse_label: "reviewed-by",
      }];
    await writeYaml(processRoot, "types/ITM.yaml", itemType);
    await writeYaml(processRoot, "scenarios/audit-groups.yaml", {
      kind: "scenario-definition",
      id: "audit-groups",
      version: 1,
      description: "Audit each exact fixture group in one coherent transaction.",
      phases: ["phase-0-terminal"],
      inputs: [{
        name: "group",
        types: ["GRP"],
        cardinality: "one",
        identity: "revision",
      }],
      outputs: [{
        name: "audit",
        types: ["ITM"],
        cardinality: "one",
        required_links: [{ link: "reviews", target: { input: "group" } }],
      }],
      prompt_ref: "prompts/audit-groups.md@1",
      review_policy_ref: "no-waiver@1",
      completion: "execution.integrity.contract_valid == true",
      resolves: ["group-audits-required"],
      prohibited_inputs: [],
      batching: "coherent-batch",
    });
    await fs.writeFile(
      path.join(processRoot, "prompts/audit-groups.md"),
      "---\nid: audit-groups\nversion: 1\nscenario: audit-groups\n---\n\n# Audit groups\n",
    );
    await writeYaml(processRoot, "obligations/group-audits-required.yaml", {
      kind: "obligation-definition",
      id: "group-audits-required",
      version: 1,
      description: "Require one audit per exact fixture group.",
      phases: ["phase-0-terminal"],
      for_each: "[phase]",
      subject_as: "terminal_scope",
      satisfied_when: "false",
      status_rules: [{
        status: "ready",
        priority: 1,
        when: 'exists("partitioned-groups@1", {})',
        reason: "Audit every exact fixture group.",
      }],
      default_status: "blocked",
      resolve_with: {
        scenario: "audit-groups@1",
        dispatch: {
          for_each: 'select("partitioned-groups@1", {})',
          as: "group",
        },
        inputs: { group: "group" },
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
    phase.outputs.push("GRP");
    await writeYaml(processRoot, "phases/phase-0-terminal.yaml", phase);
    const profilePath = path.join(processRoot, "profiles/terminal.yaml");
    const profile = parse(await fs.readFile(profilePath, "utf8"));
    profile.enabled.types.push("GRP");
    await writeYaml(processRoot, "profiles/terminal.yaml", profile);

    const repository = path.join(parent, "repository");
    await fs.mkdir(repository);
    await selectProcessPackageFixture(repository, processRoot);

    const seed = await command(repository, ["next", "--json"]);
    expect(seed.status, JSON.stringify(seed.value)).toBe(0);
    const seedResponse = structuredClone(seed.value.assignment.packet.responseScaffold);
    expect(seedResponse.proposal.outputs).toEqual([
      expect.objectContaining({ handle: "item", output: "item" }),
    ]);
    seedResponse.proposal.outputs = [1, 2].map((index) => ({
      ...structuredClone(seedResponse.proposal.outputs[0]),
      handle: `item-${index}`,
      payload: {},
      body: `Item ${index}.\n`,
    }));
    seedResponse.proposal.completionEvidence = { summary: "Published two items." };
    const seeded = await command(
      repository,
      ["scenario", "submit", "-", "--json"],
      `${JSON.stringify(seedResponse)}\n`,
    );
    expect(seeded.status, JSON.stringify(seeded.value)).toBe(0);
    commit(repository, "Publish two fixture items");

    const next = await command(repository, ["next", "--json"]);
    expect(next.status, JSON.stringify(next.value)).toBe(0);
    expect(next.value).toMatchObject({
      outcome: "assignment",
      assignment: {
        packet: { scenario: { reference: "partition-items@1" } },
      },
    });
    const packet = next.value.assignment.packet;
    const targets = packet.exactInputs[0].inputs[0].values.map(
      (value: Json) => value.identity.revision_id,
    );
    expect(targets).toHaveLength(2);
    expect(packet.responseScaffold.proposal.outputs).toEqual([
      expect.objectContaining({ handle: "group", output: "group" }),
      expect.objectContaining({ handle: "questions", output: "questions" }),
    ]);

    const response = structuredClone(packet.responseScaffold);
    const groupTemplate = response.proposal.outputs[0];
    response.proposal.outputs = targets.map((target: string, index: number) => ({
      ...structuredClone(groupTemplate),
      handle: `group-${index + 1}`,
      payload: {},
      links: [
        { type: "covers", target: { datum: target } },
        ...groupTemplate.links.filter((link: Json) => link.type === "asks"),
      ],
      body: `Group ${index + 1}.\n`,
    }));
    response.proposal.completionEvidence = {
      summary: "Every exact item belongs to one group.",
    };

    const invalid = structuredClone(response);
    invalid.proposal.outputs[1].links = structuredClone(
      invalid.proposal.outputs[0].links,
    );
    const rejected = await command(
      repository,
      ["scenario", "submit", "-", "--json"],
      `${JSON.stringify(invalid)}\n`,
    );
    expect(rejected.status).toBe(1);
    expect(rejected.value.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "scenario-output-link-distribution-incomplete",
        message: expect.stringContaining("exactly once, received 2"),
      }),
      expect.objectContaining({
        code: "scenario-output-link-distribution-incomplete",
        message: expect.stringContaining("exactly once, received 0"),
      }),
    ]));

    const accepted = await command(
      repository,
      ["scenario", "submit", "-", "--json"],
      `${JSON.stringify(response)}\n`,
    );
    expect(accepted.status, JSON.stringify(accepted.value)).toBe(0);
    expect(accepted.value.receipt.publications).toEqual([
      expect.objectContaining({ handle: "group-1" }),
      expect.objectContaining({ handle: "group-2" }),
    ]);
    commit(repository, "Publish two fixture groups");

    const batched = await command(repository, ["next", "--json"]);
    expect(batched.status, JSON.stringify(batched.value)).toBe(0);
    const batchedPacket = batched.value.assignment.packet;
    expect(batchedPacket.scenario.reference).toBe("audit-groups@1");
    expect(batchedPacket.exactInputs).toHaveLength(2);
    expect(batchedPacket.responseScaffold.proposal.outputs).toEqual([
      expect.objectContaining({
        handle: "invocation-1-audit",
        output: "audit",
        invocation: 0,
        links: [{ type: "reviews", target: { input: "group" } }],
      }),
      expect.objectContaining({
        handle: "invocation-2-audit",
        output: "audit",
        invocation: 1,
        links: [{ type: "reviews", target: { input: "group" } }],
      }),
    ]);
    const auditResponse = structuredClone(
      batchedPacket.responseScaffold,
    );
    auditResponse.proposal.outputs = auditResponse.proposal.outputs.map(
      (output: Json) => ({
        ...output,
        payload: {},
        body: `Audit invocation ${output.invocation}.\n`,
      }),
    );
    auditResponse.proposal.completionEvidence = {
      summary: "Audited every exact group in its bound invocation.",
    };
    const audited = await command(
      repository,
      ["scenario", "submit", "-", "--json"],
      `${JSON.stringify(auditResponse)}\n`,
    );
    expect(audited.status, JSON.stringify(audited.value)).toBe(0);
    expect(audited.value.receipt.publications).toEqual([
      expect.objectContaining({ handle: "invocation-1-audit" }),
      expect.objectContaining({ handle: "invocation-2-audit" }),
    ]);
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
}, 30_000);

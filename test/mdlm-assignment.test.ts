import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const mdlmExecutable = path.join(projectRoot, "dist/mdlm.js");

function invokeMdlm(
  repository: string,
  arguments_: string[],
  input?: string,
) {
  return spawnSync(process.execPath, [mdlmExecutable, ...arguments_], {
    cwd: repository,
    encoding: "utf8",
    ...(input === undefined ? {} : { input }),
    maxBuffer: 10 * 1024 * 1024,
  });
}

function mdlm(repository: string, ...arguments_: string[]) {
  return invokeMdlm(repository, arguments_);
}

function mdlmWithInput(repository: string, input: string, ...arguments_: string[]) {
  return invokeMdlm(repository, arguments_, input);
}

function git(repository: string, ...arguments_: string[]) {
  return spawnSync("git", ["-C", repository, ...arguments_], {
    encoding: "utf8",
  });
}

async function directoryBytes(root: string): Promise<string> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else files.push(path.relative(root, absolute));
    }
  }
  await visit(root);
  const content = await Promise.all(files.sort().map(async (file) => [
    file,
    (await fs.readFile(path.join(root, file))).toString("base64"),
  ]));
  return JSON.stringify(content);
}

describe("MDLM Assignment leasing and preparation", () => {
  let parent: string;
  let repository: string;

  beforeEach(async () => {
    parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-assignment-public-"));
    repository = path.join(parent, "repository");
    const initialized = mdlm(parent, "init", repository, "--json");
    expect(initialized.status, `${initialized.stderr}${initialized.stdout}`).toBe(0);
  });

  afterEach(async () => {
    await fs.rm(parent, { recursive: true, force: true });
  });

  it("leases one exact bundled-package Assignment and prepares its complete packet", async () => {
    const first = mdlm(repository, "next");
    expect(first.status, `${first.stderr}${first.stdout}`).toBe(0);
    const outcome = JSON.parse(first.stdout);
    expect(outcome).toEqual(expect.objectContaining({
      ok: true,
      command: "next",
      contract: "mdlm-next@1",
      outcome: "assignment",
      assignment: { id: expect.any(String) },
      diagnostics: [],
    }));
    expect(outcome.assignment.id).toMatch(/^[0-9a-f-]{36}$/i);

    const repeated = mdlm(repository, "next");
    expect(repeated.status, repeated.stderr).toBe(0);
    expect(JSON.parse(repeated.stdout).assignment).toEqual(outcome.assignment);

    const leasePath = path.join(
      repository,
      ".lifecycle/work/active-assignment.json",
    );
    const lease = JSON.parse(await fs.readFile(leasePath, "utf8"));
    expect(lease).toEqual(expect.objectContaining({
      contract: "mdlm-assignment-lease@1",
      id: outcome.assignment.id,
      disposition: "active",
      package: expect.objectContaining({
        reference: "mdlm-bootstrap@0.49.0",
        digest: expect.stringMatching(/^sha256:/),
      }),
      repository: {
        head: expect.stringMatching(/^[0-9a-f]{40}$/),
        trackedState: expect.stringMatching(/^sha256:/),
      },
      phase: "phase-0-wayfinding@2",
      obligation: {
        instance: expect.stringContaining("initial-wayfinding-map-required@1:"),
        definition: "initial-wayfinding-map-required@1",
        subject: "phase-0-wayfinding@2",
      },
      scenario: "establish-initial-wayfinding-map@1",
      bindings: [{ invocation: 0, inputs: [] }],
      participation: [],
      retryAvailability: { malformedResponseCorrection: 1 },
    }));

    const extraArgument = mdlm(
      repository,
      "scenario",
      "prepare",
      outcome.assignment.id,
      "extra",
    );
    expect(extraArgument.status).toBe(1);
    expect(JSON.parse(extraArgument.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "scenario-prepare-arguments-invalid" }),
    ]);

    const prepared = mdlm(
      repository,
      "scenario",
      "prepare",
      outcome.assignment.id,
    );
    expect(prepared.status, `${prepared.stderr}${prepared.stdout}`).toBe(0);
    const packet = JSON.parse(prepared.stdout);
    expect(Object.keys(packet).sort()).toEqual([
      "allowedProjections",
      "assets",
      "assignment",
      "authority",
      "command",
      "completion",
      "contract",
      "diagnostics",
      "exactInputs",
      "obligation",
      "ok",
      "outputLinks",
      "outputs",
      "package",
      "participation",
      "phase",
      "policies",
      "prohibitions",
      "prompt",
      "repository",
      "responseSchema",
      "scenario",
    ]);
    expect(packet).toEqual(expect.objectContaining({
      ok: true,
      command: "scenario.prepare",
      contract: "mdlm-assignment-packet@1",
      assignment: { id: outcome.assignment.id },
      package: {
        reference: lease.package.reference,
        digest: lease.package.digest,
        language: lease.package.language,
      },
      repository: lease.repository,
      phase: "phase-0-wayfinding@2",
      obligation: lease.obligation,
      scenario: expect.objectContaining({
        reference: "establish-initial-wayfinding-map@1",
      }),
      prompt: expect.objectContaining({
        reference: "prompts/establish-initial-wayfinding-map.md@1",
        content: expect.stringContaining("# Establish the initial wayfinding map"),
      }),
      assets: expect.arrayContaining([
        expect.objectContaining({
          reference: "prompts/establish-initial-wayfinding-map.md@1",
        }),
        expect.objectContaining({ reference: "skills/lifecycle-data.md@1" }),
        expect.objectContaining({ reference: "skills/wayfinding-map.md@1" }),
        expect.objectContaining({ reference: "skills/clarification-protocol.md@1" }),
        expect.objectContaining({ reference: "skills/scope-challenge.md@1" }),
      ]),
      exactInputs: [{ inputs: [] }],
      allowedProjections: expect.objectContaining({
        exactLifecycleData: [],
        outputSchemas: expect.arrayContaining([
          expect.objectContaining({ type: "MAP" }),
          expect.objectContaining({ type: "QST" }),
        ]),
      }),
      policies: expect.arrayContaining([
        expect.objectContaining({
          role: "review",
          reference: "review-applicability@1",
        }),
        expect.objectContaining({
          role: "waiver",
          reference: "waiver-applicability@1",
        }),
      ]),
      participation: [],
      authority: {
        evidence: null,
        requirements: [],
        standingDelegation: null,
      },
      prohibitions: [
        "generated indexes as lifecycle truth",
        "unstated stakeholder preferences",
      ],
      outputs: expect.arrayContaining([
        expect.objectContaining({ name: "map", types: ["MAP"], cardinality: "one" }),
        expect.objectContaining({ name: "questions", types: ["QST"], cardinality: "zero-or-more" }),
      ]),
      outputLinks: expect.any(Array),
      completion: expect.objectContaining({
        status: "pending-output",
        expression: expect.stringContaining("map.payload.frontier"),
      }),
      responseSchema: expect.objectContaining({
        $id: "https://mdlm.dev/contracts/mdlm-assignment-response@1",
        oneOf: expect.arrayContaining([
          expect.objectContaining({
            properties: expect.objectContaining({
              assignment: { type: "string", minLength: 1 },
            }),
          }),
        ]),
      }),
      diagnostics: [],
    }));
    const proposalSchema = packet.responseSchema.oneOf[0].properties.proposal;
    expect(proposalSchema.required).toContain("loadedSkillRefs");
    expect(proposalSchema.properties.outputs.items.required).toContain("localId");
    expect(proposalSchema.properties.outputs.items.properties.localId.description)
      .toContain("$proposal.<localId>.revision_id");

    expect(git(repository, "status", "--porcelain").stdout).toBe("");
    const ignored = git(
      repository,
      "check-ignore",
      ".lifecycle/work/active-assignment.json",
    );
    expect(ignored.status, ignored.stderr).toBe(0);
    expect(ignored.stdout).toBe(".lifecycle/work/active-assignment.json\n");
    expect((await fs.readdir(path.join(repository, ".lifecycle/data"))).sort())
      .toEqual([".gitkeep"]);
  });

  it("does not expose adapter execution through mdlm", async () => {
    const marker = path.join(parent, "adapter-invoked");
    const adapter = path.join(parent, "adapter.mjs");
    await fs.writeFile(
      adapter,
      `#!/usr/bin/env node\nimport fs from "node:fs";\nfs.writeFileSync(${JSON.stringify(marker)}, "invoked");\nprocess.stdout.write(JSON.stringify({ outputs: [], completionEvidence: {} }));\n`,
      { mode: 0o755 },
    );

    const result = mdlm(
      repository,
      "scenario",
      "execute",
      "establish-initial-wayfinding-map@1",
      "--initiate",
      "--adapter",
      adapter,
      "--json",
    );

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "unknown-command" }),
    ]);

    const alias = mdlm(
      repository,
      "question",
      "resolve",
      "--question",
      "QST-0123456789-r00001",
      "--obligation",
      "not-dispatchable",
      "--adapter",
      adapter,
      "--json",
    );
    expect(alias.status).toBe(1);
    expect(JSON.parse(alias.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "unknown-command" }),
    ]);
    await expect(fs.stat(marker)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("validates and atomically publishes one Assignment Response from file or stdin", async () => {
    const next = JSON.parse(mdlm(repository, "next").stdout);
    const assignment = next.assignment.id as string;
    const packet = JSON.parse(mdlm(
      repository,
      "scenario",
      "prepare",
      assignment,
    ).stdout);
    const loadedSkillRefs = packet.prompt.skills.map(
      (skill: { reference: string }) => skill.reference,
    );
    const response = {
      contract: "mdlm-assignment-response@1",
      assignment,
      kind: "proposal",
      proposal: {
        outputs: [{
          localId: "map",
          name: "map",
          invocation: 0,
          lifecycleDatum: {
            type: "MAP",
            payload: {
              title: "Initial product wayfinding",
              purpose: "Bound the first product-intent conversation.",
              frontier: ["$proposal.question.revision_id"],
            },
            links: [],
            body: "One exact initial decision frontier.\n",
          },
        }, {
          localId: "question",
          name: "questions",
          invocation: 0,
          lifecycleDatum: {
            type: "QST",
            payload: {
              title: "Clarify the intended product outcome",
              kind: "preferential",
              question: "Which exact product outcome should this repository pursue?",
              state: "open",
              blocking_impact: "Product intent cannot advance without this answer.",
            },
            links: [],
            body: "One exact stakeholder question.\n",
          },
        }],
        completionEvidence: {
          summary: "The initial decision frontier is explicit.",
        },
        loadedSkillRefs,
        authoritySupplies: [],
        standingDelegations: [],
      },
    };
    const responsePath = path.join(parent, "response.json");
    const before = git(repository, "diff", "--binary", "HEAD").stdout;
    const rejectionCases = [
      {
        code: "scenario-completion-failed",
        mutate(candidate: typeof response) {
          candidate.proposal.outputs[0]!.lifecycleDatum.payload.frontier = [];
        },
      },
      {
        code: "scenario-output-cardinality-invalid",
        mutate(candidate: typeof response) {
          candidate.proposal.outputs = candidate.proposal.outputs.slice(1);
        },
      },
      {
        code: "scenario-output-undeclared",
        mutate(candidate: typeof response) {
          candidate.proposal.outputs[1]!.name = "undeclared";
        },
      },
      {
        code: "scenario-output-schema-invalid",
        mutate(candidate: typeof response) {
          candidate.proposal.outputs[0]!.lifecycleDatum.payload = {} as typeof candidate.proposal.outputs[0]["lifecycleDatum"]["payload"];
        },
      },
      {
        code: "scenario-skill-reference-unknown",
        mutate(candidate: typeof response) {
          candidate.proposal.loadedSkillRefs = ["skills/not-in-the-assignment.md@1"];
        },
      },
      {
        code: "scenario-output-local-id-duplicate",
        mutate(candidate: typeof response) {
          candidate.proposal.outputs[1]!.localId = "map";
        },
      },
      {
        code: "scenario-output-local-reference-unknown",
        mutate(candidate: typeof response) {
          candidate.proposal.outputs[0]!.lifecycleDatum.payload.frontier = [
            "$proposal.unknown.revision_id",
          ];
        },
      },
    ];
    for (const rejectionCase of rejectionCases) {
      const invalid = structuredClone(response);
      rejectionCase.mutate(invalid);
      await fs.writeFile(responsePath, `${JSON.stringify(invalid)}\n`);
      const rejected = mdlm(repository, "scenario", "submit", responsePath);
      expect(rejected.status).toBe(1);
      expect(JSON.parse(rejected.stdout).diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: rejectionCase.code }),
        ]),
      );
    }
    expect(git(repository, "diff", "--binary", "HEAD").stdout).toBe(before);
    expect((await fs.readdir(path.join(repository, ".lifecycle/data"))).sort())
      .toEqual([".gitkeep"]);

    const forgedIdentity = structuredClone(response);
    Object.assign(forgedIdentity.proposal.outputs[0]!.lifecycleDatum, {
      id: "MAP-0123456789",
    });
    await fs.writeFile(responsePath, `${JSON.stringify(forgedIdentity)}\n`);
    const identityRejected = mdlm(repository, "scenario", "submit", responsePath);
    expect(identityRejected.status).toBe(1);
    expect(JSON.parse(identityRejected.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "scenario-output-identity-kernel-managed" }),
    ]);
    expect((await fs.readdir(path.join(repository, ".lifecycle/data"))).sort())
      .toEqual([".gitkeep"]);

    const submitted = mdlmWithInput(
      repository,
      `${JSON.stringify(response)}\n`,
      "scenario",
      "submit",
    );

    expect(submitted.status, `${submitted.stderr}${submitted.stdout}`).toBe(0);
    const result = JSON.parse(submitted.stdout);
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      command: "scenario.submit",
      contract: "mdlm-scenario-execution@4",
      execution: expect.objectContaining({
        contract: "mdlm-scenario-execution@4",
        status: "completed",
        response: {
          contract: "mdlm-assignment-response@1",
          assignment,
          digest: expect.stringMatching(/^sha256:/),
        },
        outputs: expect.arrayContaining([expect.objectContaining({
          name: "map",
          lifecycleDatum: expect.objectContaining({
            id: expect.stringMatching(/^MAP-/),
            revision: 1,
            revisionId: expect.stringMatching(/^MAP-.*-r00001$/),
            type: "MAP",
          }),
        })]),
      }),
      diagnostics: [],
    }));
    expect(result.execution).not.toHaveProperty("adapter");
    expect(result.execution.skills.map((skill: { reference: string }) => skill.reference))
      .toEqual(loadedSkillRefs);
    expect(result.execution.outputs[0].data.created_by.loaded_skill_refs)
      .toEqual(loadedSkillRefs);
    expect(result.execution.outputs[0].data.payload.frontier).toEqual([
      result.execution.outputs[1].lifecycleDatum.revisionId,
    ]);
    await expect(fs.stat(path.join(
      repository,
      ".lifecycle/work/active-assignment.json",
    ))).rejects.toMatchObject({ code: "ENOENT" });

    const doctor = mdlm(repository, "doctor", "--json");
    expect(doctor.status, `${doctor.stderr}${doctor.stdout}`).toBe(0);
    expect(git(repository, "status", "--porcelain").stdout).toContain(
      "?? .lifecycle/data/.transactions/",
    );
    expect(git(repository, "add", "-N", ".lifecycle/data").status).toBe(0);
    expect(git(repository, "diff", "--", ".lifecycle/data").stdout).toContain(
      "mdlm-scenario-execution@4",
    );

    const published = await directoryBytes(path.join(repository, ".lifecycle/data"));
    await fs.writeFile(responsePath, `${JSON.stringify(response)}\n`);
    const replay = mdlm(repository, "scenario", "submit", responsePath);
    expect(replay.status).toBe(1);
    expect(JSON.parse(replay.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "assignment-unavailable" }),
    ]);
    expect(await directoryBytes(path.join(repository, ".lifecycle/data"))).toBe(
      published,
    );

    expect(git(repository, "add", ".lifecycle/data").status).toBe(0);
    expect(git(
      repository,
      "-c",
      "user.name=MDLM Test",
      "-c",
      "user.email=mdlm-test@example.invalid",
      "commit",
      "-m",
      "Publish initial Scenario transaction",
    ).status).toBe(0);
    expect(git(repository, "status", "--porcelain").stdout).toBe("");
  }, 15_000);

  it("publishes a contract-valid unfavorable independent judgment unchanged", async () => {
    const commitTransaction = (message: string) => {
      expect(git(repository, "add", ".lifecycle/data").status).toBe(0);
      expect(git(
        repository,
        "-c",
        "user.name=MDLM Test",
        "-c",
        "user.email=mdlm-test@example.invalid",
        "commit",
        "-m",
        message,
      ).status).toBe(0);
    };
    const respond = (assignment: string, proposal: Record<string, unknown>) => {
      const packet = JSON.parse(mdlm(
        repository,
        "scenario",
        "prepare",
        assignment,
      ).stdout);
      const loadedSkillRefs = packet.prompt.skills.map(
        (skill: { reference: string }) => skill.reference,
      );
      return mdlmWithInput(
        repository,
        `${JSON.stringify({
          contract: "mdlm-assignment-response@1",
          assignment,
          kind: "proposal",
          proposal: { ...proposal, loadedSkillRefs },
        })}\n`,
        "scenario",
        "submit",
      );
    };
    const submit = (assignment: string, proposal: Record<string, unknown>) => {
      const result = respond(assignment, proposal);
      expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
      return JSON.parse(result.stdout).execution;
    };
    const publishPendingContexts = () => {
      let outcome = JSON.parse(mdlm(repository, "next").stdout);
      let packet = JSON.parse(mdlm(
        repository,
        "scenario",
        "prepare",
        outcome.assignment.id,
      ).stdout);
      while (packet.scenario.reference === "create-review-context@1") {
        const subject = packet.exactInputs[0].inputs
          .find((input: any) => input.name === "subject")
          .values[0].identity.revision_id as string;
        submit(outcome.assignment.id, {
          outputs: [{
            localId: `context-${subject}`,
            name: "context",
            invocation: 0,
            lifecycleDatum: {
              type: "BSL",
              payload: {
                title: `Review context for ${subject}`,
                kind: "review-context",
                role: "review-context",
                scope: subject,
                group: "phase-0-wayfinding",
                definition_members: [subject],
                evidence: [],
              },
              links: [],
              body: "Exact frozen review context.\n",
            },
          }],
          completionEvidence: { summary: "Context proposed." },
          authoritySupplies: [],
          standingDelegations: [],
        });
        commitTransaction(`Publish context for ${subject}`);
        outcome = JSON.parse(mdlm(repository, "next").stdout);
        packet = JSON.parse(mdlm(
          repository,
          "scenario",
          "prepare",
          outcome.assignment.id,
        ).stdout);
      }
      return { outcome, packet };
    };

    const mapAssignment = JSON.parse(mdlm(repository, "next").stdout).assignment.id;
    submit(mapAssignment, {
      outputs: [{
        localId: "map",
        name: "map",
        invocation: 0,
        lifecycleDatum: {
          type: "MAP",
          payload: {
            title: "Review target",
            purpose: "Prove independent unfavorable judgment publication.",
            frontier: ["Independently review this exact map"],
          },
          links: [],
          body: "Exact subject for independent review.\n",
        },
      }],
      completionEvidence: { summary: "Map proposed." },
      authoritySupplies: [],
      standingDelegations: [],
    });
    commitTransaction("Publish map");

    let progression = publishPendingContexts();
    expect(progression.packet.scenario.reference).toBe("compile-psp@2");
    const pspExecution = submit(progression.outcome.assignment.id, {
      outputs: [{
        localId: "product-specification",
        name: "product_specification",
        invocation: 0,
        lifecycleDatum: {
          type: "PSP",
          payload: {
            title: "Independent-review publication tracer",
            rationale: "A minimal product definition makes the review route reachable.",
            problem: "Unfavorable independent judgments must publish unchanged.",
            users: ["MDLM operator"],
            goals: ["Preserve exact independent judgment"],
            non_goals: [],
            success_measures: ["One failed Review publishes exactly"],
          },
          links: [],
          body: "Minimal exact product intent.\n",
        },
      }],
      completionEvidence: { summary: "Product specification proposed." },
      authoritySupplies: [],
      standingDelegations: [],
    });
    const pspRevision = pspExecution.outputs[0].lifecycleDatum.revisionId as string;
    const pspStable = pspExecution.outputs[0].lifecycleDatum.id as string;
    commitTransaction("Publish product specification");

    progression = publishPendingContexts();
    expect(progression.packet.scenario.reference).toBe("draft-stakeholder-requirements@2");
    const requirementProposal = {
      outputs: [{
        localId: "stakeholder-requirement",
        name: "requirements",
        invocation: 0,
        lifecycleDatum: {
          type: "STK",
          payload: {
            title: "Preserve unfavorable judgments",
            rationale: "Independent authority evidence must not be suppressed.",
            statement: "MDLM shall publish a contract-valid unfavorable independent judgment unchanged.",
            verification_intent: "Submit an exact failed Review and inspect its canonical payload.",
            stakeholder: "MDLM operator",
            priority: "must",
          },
          links: [{ type: "derived-from", target: pspStable }],
          body: "One stakeholder-visible publication commitment.\n",
        },
      }],
      completionEvidence: { summary: "Stakeholder requirement proposed." },
      authoritySupplies: [],
      standingDelegations: [],
    };
    const missingRequiredLink = structuredClone(requirementProposal);
    missingRequiredLink.outputs[0]!.lifecycleDatum.links = [];
    const linkRejected = respond(
      progression.outcome.assignment.id,
      missingRequiredLink,
    );
    expect(linkRejected.status).toBe(1);
    expect(JSON.parse(linkRejected.stdout).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "scenario-output-required-link-missing" }),
      ]),
    );
    submit(progression.outcome.assignment.id, requirementProposal);
    commitTransaction("Publish stakeholder requirement");

    progression = publishPendingContexts();
    const reviewOutcome = progression.outcome;
    const reviewPacket = progression.packet;
    expect(pspRevision).toMatch(/^PSP-.*-r00001$/);
    expect(reviewPacket.scenario.reference).toBe("review-datum-in-context@2");
    expect(reviewPacket.authority.requirements).toEqual([
      expect.objectContaining({
        authorityRequirement: expect.objectContaining({
          mode: "delegated",
          authority: "independent-reviewer",
        }),
      }),
    ]);
    const reviewedSubject = reviewPacket.exactInputs[0].inputs
      .find((input: any) => input.name === "subject").values[0].identity.revision_id as string;
    const reviewedContext = reviewPacket.exactInputs[0].inputs
      .find((input: any) => input.name === "review_context").values[0].identity.revision_id as string;
    const finding = {
      id: "F-001",
      target: reviewedSubject,
      relationship: "primary",
      severity: "blocking",
      summary: "The proposed frontier does not yet identify the intended product outcome.",
    };
    const reviewExecution = submit(reviewOutcome.assignment.id, {
      outputs: [{
        localId: "review",
        name: "review",
        invocation: 0,
        lifecycleDatum: {
          type: "REV",
          payload: {
            title: "Independent map review",
            review_kind: "contextual",
            rubric_ref: "policies/rubrics/contextual-review.md@1",
            findings: [finding],
            outcome: "fail",
          },
          links: [
            { type: "reviews", target: reviewedSubject },
            { type: "contextualizes", target: reviewedContext },
          ],
          body: "The exact independent judgment is unfavorable.\n",
        },
      }],
      completionEvidence: { summary: "Independent review completed." },
      authoritySupplies: ["independent-reviewer"],
      standingDelegations: [],
    });

    expect(reviewExecution.authority.supplied).toEqual(["independent-reviewer"]);
    expect(reviewExecution.outputs[0].data.payload).toEqual(expect.objectContaining({
      outcome: "fail",
      findings: [finding],
    }));
    expect(mdlm(repository, "doctor", "--json").status).toBe(0);
  }, 20_000);

  it("keeps the versioned Assignment Response schema stable across Assignments", async () => {
    const first = JSON.parse(mdlm(repository, "next").stdout);
    const firstPacket = JSON.parse(mdlm(
      repository,
      "scenario",
      "prepare",
      first.assignment.id,
    ).stdout);

    const secondRepository = path.join(parent, "second-repository");
    const initialized = mdlm(parent, "init", secondRepository, "--json");
    expect(initialized.status, `${initialized.stderr}${initialized.stdout}`).toBe(0);
    const second = JSON.parse(mdlm(secondRepository, "next").stdout);
    const secondPacket = JSON.parse(mdlm(
      secondRepository,
      "scenario",
      "prepare",
      second.assignment.id,
    ).stdout);

    expect(second.assignment.id).not.toBe(first.assignment.id);
    expect(secondPacket.responseSchema).toEqual(firstPacket.responseSchema);
  });

  it("rejects corrupt exact lease contents instead of recovering automatically", async () => {
    const next = mdlm(repository, "next");
    expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
    const leasePath = path.join(
      repository,
      ".lifecycle/work/active-assignment.json",
    );
    const lease = JSON.parse(await fs.readFile(leasePath, "utf8"));
    await fs.writeFile(leasePath, JSON.stringify({
      ...lease,
      bindings: [7],
      participation: ["not-participation"],
    }));

    const corrupt = mdlm(repository, "next");

    expect(corrupt.status).toBe(1);
    expect(JSON.parse(corrupt.stdout)).toEqual(expect.objectContaining({
      ok: false,
      command: "next",
      diagnostics: [expect.objectContaining({
        code: "assignment-lease-invalid",
      })],
    }));
  });

  it("rejects corrupt package and repository fingerprints instead of recovering", async () => {
    const next = mdlm(repository, "next");
    expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
    const leasePath = path.join(
      repository,
      ".lifecycle/work/active-assignment.json",
    );
    const lease = JSON.parse(await fs.readFile(leasePath, "utf8"));
    await fs.writeFile(leasePath, JSON.stringify({
      ...lease,
      package: { ...lease.package, digest: "corrupt" },
      repository: { ...lease.repository, head: "corrupt" },
    }));

    const corrupt = mdlm(repository, "next");

    expect(corrupt.status).toBe(1);
    expect(JSON.parse(corrupt.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "assignment-lease-invalid" }),
    ]);
  });

  it("reports malformed Assignment lease JSON without an untyped command error", async () => {
    const next = mdlm(repository, "next");
    expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
    await fs.writeFile(
      path.join(repository, ".lifecycle/work/active-assignment.json"),
      "not json\n",
    );

    const malformed = mdlm(repository, "next");

    expect(malformed.status).toBe(1);
    expect(JSON.parse(malformed.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "assignment-lease-invalid" }),
    ]);
  });

  it("rejects preparation after tracked repository state changes without rebasing", async () => {
    const next = mdlm(repository, "next");
    const assignment = JSON.parse(next.stdout).assignment.id as string;
    await fs.appendFile(path.join(repository, ".gitignore"), "# tracked change\n");

    const prepared = mdlm(repository, "scenario", "prepare", assignment);

    expect(prepared.status).toBe(1);
    expect(JSON.parse(prepared.stdout)).toEqual(expect.objectContaining({
      ok: false,
      command: "scenario.prepare",
      diagnostics: [expect.objectContaining({ code: "assignment-stale" })],
    }));

    expect(git(repository, "checkout", "--", ".gitignore").status).toBe(0);
    const restored = mdlm(repository, "scenario", "prepare", assignment);
    expect(restored.status).toBe(1);
    expect(JSON.parse(restored.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "assignment-unavailable" }),
    ]);
  });

  it("does not retain the old next projection options", () => {
    const next = mdlm(repository, "next", "--phase", "phase-0-wayfinding");

    expect(next.status).toBe(1);
    expect(JSON.parse(next.stdout)).toEqual(expect.objectContaining({
      ok: false,
      command: "next",
      diagnostics: [expect.objectContaining({
        code: "next-arguments-unsupported",
      })],
    }));
  });

  it("rejects preparation after the selected Process Package changes", async () => {
    const next = mdlm(repository, "next");
    const assignment = JSON.parse(next.stdout).assignment.id as string;
    await fs.appendFile(
      path.join(
        repository,
        ".lifecycle/packages/mdlm-bootstrap@0.49.0/prompts/establish-initial-wayfinding-map.md",
      ),
      "\nPackage change.\n",
    );

    const prepared = mdlm(repository, "scenario", "prepare", assignment);

    expect(prepared.status).toBe(1);
    expect(JSON.parse(prepared.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "assignment-stale" }),
    ]);
  });

  it("invalidates the active lease when next observes a package change", async () => {
    const first = JSON.parse(mdlm(repository, "next").stdout);
    const promptRelative =
      ".lifecycle/packages/mdlm-bootstrap@0.49.0/prompts/establish-initial-wayfinding-map.md";
    await fs.appendFile(path.join(repository, promptRelative), "\nPackage change.\n");

    const changed = mdlm(repository, "next");

    expect(changed.status).toBe(1);
    expect(JSON.parse(changed.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "process-package-selection-mismatch" }),
    ]);
    expect(git(repository, "checkout", "--", promptRelative).status).toBe(0);
    const fresh = JSON.parse(mdlm(repository, "next").stdout);
    expect(fresh.assignment.id).not.toBe(first.assignment.id);
  });
});

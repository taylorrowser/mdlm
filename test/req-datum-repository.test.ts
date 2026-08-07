import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { req } from "./helpers/req.js";

const bootstrapPackage = path.join(process.cwd(), ".lifecycle/process");

describe("req durable Lifecycle Datum repository", () => {
  let repositoryRoot: string;

  beforeEach(async () => {
    repositoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-datum-repo-"));
  });

  afterEach(async () => {
    await fs.rm(repositoryRoot, { recursive: true, force: true });
  });

  async function initialize(): Promise<void> {
    const initialized = req(
      repositoryRoot,
      "init",
      "--process",
      bootstrapPackage,
      "--json",
    );
    expect(initialized.status, initialized.stderr).toBe(0);
  }

  function createMinimalPsp() {
    return req(
      repositoryRoot,
      "new",
      "PSP",
      "--scenario",
      "compile-psp@2",
      "--set",
      "title=Indexed truth",
      "--set",
      "rationale=Indexes must remain disposable",
      "--set",
      "problem=Generated data can be mistaken for truth",
      "--set",
      'users=["lifecycle author"]',
      "--set",
      'goals=["rebuild generated indexes"]',
      "--set",
      'non_goals=[]',
      "--set",
      'success_measures=["list survives index deletion"]',
      "--json",
    );
  }

  it("leaves no partial repository when initialization validation fails", async () => {
    const invalidPackage = path.join(repositoryRoot, "invalid-process");
    await fs.cp(bootstrapPackage, invalidPackage, { recursive: true });
    await fs.writeFile(
      path.join(invalidPackage, "types/PSP.yaml"),
      "kind: not-a-type\n",
    );

    const result = req(
      repositoryRoot,
      "init",
      "--process",
      invalidPackage,
      "--json",
    );
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).diagnostics.length).toBeGreaterThan(0);
    await expect(fs.stat(path.join(repositoryRoot, ".lifecycle")))
      .rejects.toMatchObject({ code: "ENOENT" });
    expect((await fs.readdir(repositoryRoot)).filter((name) =>
      name.startsWith(".mdlm-init-")
    )).toEqual([]);
  });

  it("initializes atomically with an exact Process Package and supported contracts", async () => {
    const result = req(
      repositoryRoot,
      "init",
      "--process",
      bootstrapPackage,
      "--json",
    );

    expect(result.status, result.stderr).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output).toEqual({
      ok: true,
      command: "init",
      package: {
        id: "mdlm-bootstrap",
        version: "0.43.0",
        reference: "mdlm-bootstrap@0.43.0",
        language: "mdlm-expression@1",
        digest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
      repository: {
        contract: "mdlm-repository@1",
        datumEnvelope: "https://mdlm.dev/kernel/process-interface/v1/datum-envelope.schema.json",
        artifactFormat: "text/markdown; metadata=yaml-frontmatter; encoding=utf-8",
        primitiveCatalog: "primitives/kernel-v1.yaml@1",
      },
      diagnostics: [],
    });
    expect(JSON.parse(await fs.readFile(
      path.join(repositoryRoot, ".lifecycle/repository.json"),
      "utf8",
    ))).toEqual({
      schemaVersion: 1,
      repositoryContract: "mdlm-repository@1",
      package: {
        reference: "mdlm-bootstrap@0.43.0",
        digest: output.package.digest,
      },
      contracts: {
        datumEnvelope: output.repository.datumEnvelope,
        artifactFormat: output.repository.artifactFormat,
        expressionLanguage: "mdlm-expression@1",
        primitiveCatalog: output.repository.primitiveCatalog,
      },
    });
    expect(JSON.parse(await fs.readFile(
      path.join(repositoryRoot, ".lifecycle/process-selection.json"),
      "utf8",
    ))).toEqual(expect.objectContaining({
      package: expect.objectContaining({
        reference: "mdlm-bootstrap@0.43.0",
        digest: output.package.digest,
      }),
      language: { expressions: "mdlm-expression@1" },
    }));
    await expect(fs.stat(path.join(repositoryRoot, ".lifecycle/data")))
      .resolves.toMatchObject({});

    const human = req(repositoryRoot, "process", "show");
    expect(human.status, human.stderr).toBe(0);
    expect(human.stdout).toContain("Process Package: mdlm-bootstrap@0.43.0");
  });

  it("rejects invalid payloads and links without partial durable state", async () => {
    await initialize();
    const invalidPayload = req(
      repositoryRoot,
      "new",
      "PSP",
      "--scenario",
      "compile-psp@2",
      "--set",
      "title=Incomplete",
      "--json",
    );
    expect(invalidPayload.status).toBe(1);
    expect(JSON.parse(invalidPayload.stdout).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "datum-payload" }),
      ]),
    );

    const missingRequiredLink = req(
      repositoryRoot,
      "new",
      "STK",
      "--scenario",
      "draft-stakeholder-requirements@2",
      "--set",
      "title=Linked intent",
      "--set",
      "rationale=Traceability is required",
      "--set",
      "statement=The product shall retain traceability.",
      "--set",
      "verification_intent=Inspect the exact parent link.",
      "--set",
      "stakeholder=lifecycle author",
      "--set",
      "priority=must",
      "--json",
    );
    expect(missingRequiredLink.status).toBe(1);
    expect(JSON.parse(missingRequiredLink.stdout).diagnostics).toEqual([
      expect.objectContaining({
        code: "link-cardinality",
        message: expect.stringContaining("derived-from"),
      }),
    ]);

    const danglingLink = req(
      repositoryRoot,
      "new",
      "STK",
      "--scenario",
      "draft-stakeholder-requirements@2",
      "--set",
      "title=Linked intent",
      "--set",
      "rationale=Traceability is required",
      "--set",
      "statement=The product shall retain traceability.",
      "--set",
      "verification_intent=Inspect the exact parent link.",
      "--set",
      "stakeholder=lifecycle author",
      "--set",
      "priority=must",
      "--link",
      "derived-from=PSP-0123456789",
      "--json",
    );
    expect(danglingLink.status).toBe(1);
    expect(JSON.parse(danglingLink.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "unknown-link-target" }),
    ]);

    const listed = req(repositoryRoot, "list", "--json");
    expect(listed.status, listed.stderr).toBe(0);
    expect(JSON.parse(listed.stdout).data).toEqual([]);
  });

  it("rebuilds disposable indexes from Markdown truth", async () => {
    await initialize();
    const created = createMinimalPsp();
    expect(created.status, created.stderr).toBe(0);
    const identity = JSON.parse(created.stdout).created.id;

    const initialDoctor = req(repositoryRoot, "doctor", "--json");
    expect(initialDoctor.status, initialDoctor.stderr).toBe(0);
    expect(JSON.parse(initialDoctor.stdout).index).toEqual({
      rebuilt: true,
      data: 1,
      path: ".lifecycle/generated/indexes/data.json",
    });
    await fs.rm(path.join(repositoryRoot, ".lifecycle/generated/indexes"), {
      recursive: true,
      force: true,
    });

    const shown = req(repositoryRoot, "show", identity, "--json");
    const listed = req(repositoryRoot, "list", "--json");
    expect(shown.status, shown.stderr).toBe(0);
    expect(listed.status, listed.stderr).toBe(0);
    expect(JSON.parse(listed.stdout).data).toHaveLength(1);

    const rebuilt = req(repositoryRoot, "doctor", "--json");
    expect(rebuilt.status, rebuilt.stderr).toBe(0);
    expect(JSON.parse(rebuilt.stdout)).toEqual(expect.objectContaining({
      ok: true,
      command: "doctor",
      index: {
        rebuilt: true,
        data: 1,
        path: ".lifecycle/generated/indexes/data.json",
      },
      diagnostics: [],
    }));
    const current = req(repositoryRoot, "doctor", "--json");
    expect(JSON.parse(current.stdout).index.rebuilt).toBe(false);
  }, 20_000);

  it("atomically creates and reads one typed Markdown Lifecycle Datum", async () => {
    await initialize();
    const created = req(
      repositoryRoot,
      "new",
      "PSP",
      "--scenario",
      "compile-psp@2",
      "--set",
      "title=Repository round trip",
      "--set",
      "rationale=Lifecycle truth must survive generated data",
      "--set",
      "problem=Durable intent is unavailable",
      "--set",
      'users=["lifecycle author"]',
      "--set",
      'goals=["round-trip one datum"]',
      "--set",
      'non_goals=["complete repository kernel"]',
      "--set",
      'success_measures=["show returns authored content"]',
      "--body",
      "Narrative body.",
      "--json",
    );

    expect(created.status, created.stderr).toBe(0);
    const creation = JSON.parse(created.stdout);
    expect(creation).toEqual({
      ok: true,
      command: "new",
      package: expect.objectContaining({
        reference: "mdlm-bootstrap@0.43.0",
      }),
      created: {
        id: expect.stringMatching(/^PSP-[0-9A-HJKMNP-TV-Z]{10}$/),
        revisionId: expect.stringMatching(
          /^PSP-[0-9A-HJKMNP-TV-Z]{10}-r00001$/,
        ),
        type: "PSP",
        path: expect.stringMatching(
          /^\.lifecycle\/data\/PSP\/PSP-[0-9A-HJKMNP-TV-Z]{10}\/r00001\.md$/,
        ),
      },
      diagnostics: [],
    });
    expect(creation.created.revisionId).toBe(`${creation.created.id}-r00001`);
    const markdown = await fs.readFile(
      path.join(repositoryRoot, creation.created.path),
      "utf8",
    );
    expect(markdown).toMatch(/^---\nid: PSP-/);
    expect(markdown).toContain("\n---\nNarrative body.\n");

    const shown = req(repositoryRoot, "show", creation.created.id, "--json");
    expect(shown.status, shown.stderr).toBe(0);
    const showResult = JSON.parse(shown.stdout);
    expect(showResult).toEqual(expect.objectContaining({
      ok: true,
      command: "show",
      package: expect.objectContaining({
        reference: "mdlm-bootstrap@0.43.0",
      }),
      lifecycleDatum: {
        datum: expect.objectContaining({
          id: creation.created.id,
          revision: 1,
          revision_id: creation.created.revisionId,
          type: "PSP",
          payload: expect.objectContaining({
            title: "Repository round trip",
            users: ["lifecycle author"],
          }),
          links: [],
          created_by: expect.objectContaining({
            scenario: "compile-psp@2",
            prompt_ref: "prompts/compile-psp.md@2",
            process_ref: expect.stringContaining("mdlm-bootstrap@0.43.0#sha256:"),
          }),
          body: "Narrative body.\n",
        }),
        storage: { editable: true, frozen: false },
        integrity: {
          parseable: true,
          schema_valid: true,
          identity_valid: true,
          references_valid: true,
          hash_valid: true,
          scenario_execution_valid: false,
        },
      },
      projections: {
        backlinks: [],
        states: {
          maturity: "draft",
          disposition: "active",
          validity: "valid",
          "relationship-overlays": [],
          "decomposition-status": "not-applicable",
          "change-status": "not-applicable",
        },
        obligations: expect.arrayContaining([
          expect.objectContaining({
            obligation: "review-context-required",
            subject: creation.created.revisionId,
            satisfied: false,
          }),
        ]),
        kernelCapabilities: [],
      },
      diagnostics: [],
    }));

    const shownRevision = req(
      repositoryRoot,
      "show",
      creation.created.revisionId,
      "--json",
    );
    expect(shownRevision.status, shownRevision.stderr).toBe(0);
    expect(JSON.parse(shownRevision.stdout).lifecycleDatum).toEqual(
      showResult.lifecycleDatum,
    );

    const listed = req(repositoryRoot, "list", "--json");
    expect(listed.status, listed.stderr).toBe(0);
    expect(JSON.parse(listed.stdout)).toEqual(expect.objectContaining({
      ok: true,
      command: "list",
      data: [{
        lifecycleDatum: showResult.lifecycleDatum,
        projections: showResult.projections,
      }],
    }));

    const human = req(repositoryRoot, "show", creation.created.id);
    expect(human.status, human.stderr).toBe(0);
    expect(human.stdout).toContain(`Lifecycle Datum: ${creation.created.id}`);
    expect(human.stdout).toContain(`Revision: ${creation.created.revisionId}`);
    expect(human.stdout).toContain("Links: []");
    expect(human.stdout).toContain("Created By:");
    expect(human.stdout).toContain("Maturity: draft");
    expect(human.stdout).toContain("Obligations:");
    const humanList = req(repositoryRoot, "list");
    expect(humanList.status, humanList.stderr).toBe(0);
    expect(humanList.stdout).toContain("Lifecycle Data: 1");
    expect(humanList.stdout).toContain(creation.created.revisionId);
    expect(humanList.stdout).toContain("Repository round trip");
    expect(humanList.stdout).toContain("Durable:");
    expect(humanList.stdout).toContain("Projections:");
    expect(humanList.stdout).toContain('"obligation":"review-context-required"');
    expect(humanList.stdout).toContain('"status":"ready"');
  });
});

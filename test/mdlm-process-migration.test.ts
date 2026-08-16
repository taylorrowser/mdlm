import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { directoryDigest } from "./helpers/assignment-submission.js";
import {
  mdlm,
  mdlmWithInput,
  selectProcessPackageFixture,
  stageProcessPackageFixture,
} from "./helpers/mdlm.js";

const bootstrapPackage = path.join(process.cwd(), ".lifecycle/process");

async function packageCopy(
  parent: string,
  name: string,
  version: string,
): Promise<string> {
  const root = path.join(parent, name);
  await fs.cp(bootstrapPackage, root, { recursive: true });
  const manifestPath = path.join(root, "manifest.yaml");
  await fs.writeFile(
    manifestPath,
    (await fs.readFile(manifestPath, "utf8")).replace(
      "version: 0.65.0",
      `version: ${version}`,
    ),
  );
  return root;
}

async function historicalBootstrap063Copy(parent: string): Promise<string> {
  const root = await packageCopy(parent, "historical-0.63.0", "0.63.0");
  const manifestPath = path.join(root, "manifest.yaml");
  await fs.writeFile(
    manifestPath,
    (await fs.readFile(manifestPath, "utf8")).replace(
      "    - all-cited-reviews-by-correction\n",
      "",
    ),
  );
  await fs.rm(
    path.join(root, "selectors/all-cited-reviews-by-correction.yaml"),
  );
  const selectorPath = path.join(
    root,
    "selectors/corrected-pilot-verification-implementation-revisions-for.yaml",
  );
  await fs.writeFile(
    path.join(root, "prompts/revise-pilot-vai-after-review.md"),
    (await fs.readFile(
      path.join(root, "prompts/revise-pilot-vai-after-review.md"),
      "utf8",
    )).replace(
      "supplied failed Review, preserving the exact pilot claim class, declared cases,\nVER, ENV, ART, supported behavior, and intentionally unsupported behavior. The\nreplacement may revise procedure and activity-binding text when needed to address\nan exact failed Review Finding. Do not mutate or reuse the failed VAI, Reviews,\nor prior RUN/RES evidence.",
      "supplied failed Review, preserving the exact pilot claim class, case bindings,\nVER, ENV, ART, supported behavior, and intentionally unsupported behavior. Do\nnot mutate or reuse the failed VAI, Reviews, or prior RUN/RES evidence.",
    ),
  );
  const scenarioPath = path.join(
    root,
    "scenarios/revise-pilot-vai-after-review.yaml",
  );
  await fs.writeFile(
    scenarioPath,
    (await fs.readFile(scenarioPath, "utf8"))
      .replace(
        "description: Correct one failed source-blind pilot procedure in the same VAI lineage while preserving its exact VER, ENV, ART, claim-class, and behavior bindings.",
        "description: Correct one failed source-blind pilot procedure in the same VAI lineage while preserving its exact verification bindings.",
      )
      .replace(
        "prohibited_inputs: [mutation of failed VAI, RUN, RES, or Review history, changed VER, ENV, or ART binding, changed pilot claim class, product source, product unit tests, private implementation details]",
        "prohibited_inputs: [mutation of failed VAI, RUN, RES, or Review history, changed verification binding, changed pilot claim class, product source, product unit tests, private implementation details]",
      ),
  );
  const profilePath = path.join(root, "profiles/bootstrap.yaml");
  await fs.writeFile(
    profilePath,
    (await fs.readFile(profilePath, "utf8")).replace(
      "  - corrected pilot VAI procedures preserve exact VER, ENV, ART, claim-class, declared-case, and behavior bindings while allowing procedure and activity-binding text to address Review findings; they require bounded checkout, environment-check, and product-case deadlines, forced termination and reaping, partial raw observation, guaranteed cleanup, continue-through-all-cases aggregation, and fresh run evidence",
      "  - corrected pilot VAI procedures preserve exact activity, ENV, ART, claim-class, and case bindings while requiring bounded checkout, environment-check, and product-case deadlines, forced termination and reaping, partial raw observation, guaranteed cleanup, continue-through-all-cases aggregation, and fresh run evidence",
    ),
  );
  await fs.writeFile(
    selectorPath,
    (await fs.readFile(selectorPath, "utf8"))
      .replaceAll(
        '"all-cited-reviews-by-correction@1"',
        '"cited-failing-reviews-by-correction@1"',
      )
      .replace(
        '    && count("cited-failing-reviews-by-correction@1", {replacement: replacement})\n' +
          '      == count("failing-reviews-for@1", {subject: implementation})\n' +
          '    && every("cited-failing-reviews-by-correction@1", {replacement: replacement}, review =>\n',
        '    && count("cited-failing-reviews-by-correction@1",\n' +
          '      {replacement: replacement})\n' +
          '      == count("failing-reviews-for@1", {subject: implementation})\n' +
          '    && every("cited-failing-reviews-by-correction@1",\n' +
          '      {replacement: replacement}, review =>\n',
      )
      .replace(
        "description: Valid newer pilot VAI Revisions preserving exact VER, ENV, and ART links while citing every and only failed Review.",
        "description: Valid newer pilot VAI Revisions preserving every exact verification binding and citing every and only failed Review.",
      )
      .replace(
        "    && replacement.payload.independence_mode == implementation.payload.independence_mode\n",
        "    && replacement.payload.independence_mode == implementation.payload.independence_mode\n" +
          "    && replacement.payload.activity_bindings == implementation.payload.activity_bindings\n",
      ),
  );
  return root;
}

async function historicalBootstrap064Copy(parent: string): Promise<string> {
  const root = await packageCopy(parent, "historical-0.64.0", "0.64.0");
  const manifestPath = path.join(root, "manifest.yaml");
  let manifest = await fs.readFile(manifestPath, "utf8");
  for (const selector of [
    "decomposition-output-revisions-for",
    "dwp-product-simplification-blockers-for-review",
    "planning-dwp-matching-subject",
    "planning-dwp-review-context-matches",
    "planning-dwp-review-support-for",
    "valid-dwp-product-simplification-reviews",
    "legacy-thin-dwp-review-contexts-for",
  ]) {
    manifest = manifest.replace(`    - ${selector}\n`, "");
    await fs.rm(path.join(root, `selectors/${selector}.yaml`));
  }
  await fs.writeFile(manifestPath, manifest);

  const membersPath = path.join(root, "selectors/review-context-members-for.yaml");
  await fs.writeFile(
    membersPath,
    (await fs.readFile(membersPath, "utf8")).replace(
      '      || (subject.identity.type == "DWP"\n        && subject.payload.stage == "planning"\n        && !every("planning-dwp-review-support-for@1", {plan: subject}, support =>\n          support != member))\n',
      '      || (subject.identity.type == "DWP"\n        && subject.payload.stage == "planning"\n        && exists("decomposition-outputs-for@1", {plan: subject})\n        && (\n          (member.identity.type == "SYS"\n            && exists("matching-decomposition-output@1", {plan: subject, output: member}))\n          || (member.identity.type == "ASP"\n            && count("architectures-for-decomposition@1", {plan: subject}) == 1\n            && member == one("architectures-for-decomposition@1", {plan: subject}))\n          || (member.identity.type == "ICSP"\n            && exists("matching-decomposition-interface@1", {plan: subject, interface: member}))\n        ))\n      || (subject.identity.type == "DWP"\n        && member.identity.type == "SYS"\n        && !every("system-requirements-consumed-by@1", {consumer: subject}, requirement =>\n          requirement != member))\n',
    ),
  );

  const contextsPath = path.join(root, "selectors/valid-review-contexts-for.yaml");
  await fs.writeFile(
    contextsPath,
    (await fs.readFile(contextsPath, "utf8"))
      .replace('    && context.payload.role == "review-context"\n', "")
      .replace(
        '      || (subject.identity.type == "VER"\n        && !every("legacy-thin-ver-review-contexts-for@1", {subject: subject}, legacy =>\n          legacy != context))\n      || (subject.identity.type == "DWP"\n        && !every("legacy-thin-dwp-review-contexts-for@1", {subject: subject}, legacy =>\n          legacy != context)))\n',
        '      || (subject.identity.type == "VER"\n        && !every("legacy-thin-ver-review-contexts-for@1", {subject: subject}, legacy =>\n          legacy != context)))\n',
      )
      .replace(
        '    && (subject.identity.type != "DWP"\n      || subject.payload.stage != "planning"\n      || (every("planning-dwp-review-support-for@1", {plan: subject}, support =>\n          state(support, "disposition") == "active"\n          && state(support, "validity") == "valid"\n          && none("newer-revisions-for@1", {subject: support}))\n        && (!every("legacy-thin-dwp-review-contexts-for@1", {subject: subject}, legacy =>\n          legacy != context)\n        || (context.provenance.process_ref == process.current_ref\n          && every("review-context-members@1", {context: context}, context_member =>\n            context_member == subject\n            || !every("review-context-members-for@1", {subject: subject}, required =>\n              required != context_member))\n          && none("review-context-evidence@1", {context: context})\n          && none("composed-baselines-for-review-context@1", {context: context})))))\n',
        '    && (subject.identity.type != "DWP"\n      || subject.payload.stage != "planning"\n      || none("decomposition-outputs-for@1", {plan: subject})\n      || count("review-context-members@1", {context: context})\n        == count("phase-2-definition-members-for-plan@1", {plan: subject}))\n',
      ),
  );

  for (const name of ["passing-reviews-for", "failing-reviews-for"]) {
    const selectorPath = path.join(root, `selectors/${name}.yaml`);
    await fs.writeFile(
      selectorPath,
      (await fs.readFile(selectorPath, "utf8")).replace(
        '      || (exists("planning-dwp-matching-subject@1", {subject: subject})\n        && exists("valid-dwp-product-simplification-reviews@1", {review: review}))\n      || (none("intent-candidates-matching-subject@1", {subject: subject})\n        && none("planning-dwp-matching-subject@1", {subject: subject})\n',
        '      || (none("intent-candidates-matching-subject@1", {subject: subject})\n',
      ),
    );
  }
  const reviewScenarioPath = path.join(root, "scenarios/review-datum-in-context.yaml");
  await fs.writeFile(
    reviewScenarioPath,
    (await fs.readFile(reviewScenarioPath, "utf8")).replace(
      '    || (exists("planning-dwp-matching-subject@1", {subject: subject})\n      && exists("valid-dwp-product-simplification-reviews@1", {review: review}))\n    || (none("intent-candidates-matching-subject@1", {subject: subject})\n      && none("planning-dwp-matching-subject@1", {subject: subject})\n',
      '    || (none("intent-candidates-matching-subject@1", {subject: subject})\n',
    ),
  );
  const reviewTypePath = path.join(root, "types/REV.yaml");
  await fs.writeFile(
    reviewTypePath,
    (await fs.readFile(reviewTypePath, "utf8")).replace(
      "description: One exact correction target with every blocking Phase 0 or planning-DWP simplification finding that applies to it.",
      "description: One exact Phase 0 correction target with every blocking simplification finding that applies to it.",
    ),
  );
  const profilePath = path.join(root, "profiles/bootstrap.yaml");
  await fs.writeFile(
    profilePath,
    (await fs.readFile(profilePath, "utf8")).replace(
      "  - one planning DWP receives independent product-definition Review with every and only exact allocated ASP, governing ICSP, and applicable current SYS support before deriving coverage, output-review, simplification, completion, question, and blocker Obligations\n",
      "  - one reviewed DWP plan derives exact coverage, output-review, simplification, completion, question, and blocker Obligations\n",
    ),
  );
  return root;
}

async function contractBytes(repository: string): Promise<string> {
  const paths = [
    ".lifecycle/process-selection.json",
    ".lifecycle/repository.json",
  ];
  return JSON.stringify(
    await Promise.all(
      paths.map(async (relativePath) => [
        relativePath,
        await fs.readFile(path.join(repository, relativePath), "utf8"),
      ]),
    ),
  );
}

describe("mdlm Process Package migration", () => {
  let parent: string;
  let repository: string;

  beforeEach(async () => {
    parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-migration-"));
    repository = path.join(parent, "repository");
    await fs.mkdir(repository);
  });

  afterEach(async () => {
    await fs.rm(parent, { recursive: true, force: true });
  });

  it("migrates preserved 0.64.0 state and its active Assignment to exact 0.65.0", async () => {
    const previousRoot = await historicalBootstrap064Copy(parent);
    await selectProcessPackageFixture(repository, previousRoot);
    const selectedBefore = JSON.parse(
      await fs.readFile(
        path.join(repository, ".lifecycle/process-selection.json"),
        "utf8",
      ),
    );
    expect(selectedBefore.package).toEqual(
      expect.objectContaining({
        reference: "mdlm-bootstrap@0.64.0",
        digest:
          "sha256:e3759f865e15cb62a7014d1cd3c05b25bee3f2858966a1cc7ed59bfda5476c8b",
      }),
    );
    const initial = JSON.parse(mdlm(repository, "next").stdout);
    const initialPacket = JSON.parse(
      mdlm(repository, "scenario", "prepare", initial.assignment.id).stdout,
    );
    const published = mdlmWithInput(
      repository,
      `${JSON.stringify({
        contract: "mdlm-assignment-response@1",
        assignment: initial.assignment.id,
        kind: "proposal",
        proposal: {
          outputs: [
            {
              localId: "map",
              name: "map",
              invocation: 0,
              lifecycleDatum: {
                type: "MAP",
                payload: {
                  title: "Preserved 0.64.0 migration history",
                  purpose:
                    "Prove historical Lifecycle Data and Assignment compatibility.",
                  frontier: [
                    "Preserve one exact historical Scenario transaction",
                  ],
                },
                links: [],
                body: "One exact historical 0.64.0 transaction.\n",
              },
            },
          ],
          completionEvidence: {
            summary: "Published preserved 0.64.0 history.",
          },
          loadedSkillRefs: initialPacket.prompt.skills.map(
            (skill: { reference: string }) => skill.reference,
          ),
          authoritySupplies: [],
          standingDelegations: [],
        },
      })}\n`,
      "scenario",
      "submit",
    );
    expect(published.status, `${published.stderr}${published.stdout}`).toBe(0);
    const publication = JSON.parse(published.stdout);
    const mapId = publication.execution.outputs[0].lifecycleDatum.id as string;
    const historyBefore = mdlm(repository, "history", mapId, "--json");
    expect(
      historyBefore.status,
      `${historyBefore.stderr}${historyBefore.stdout}`,
    ).toBe(0);
    expect(historyBefore.stdout).toContain("mdlm-bootstrap@0.64.0");
    const dataBefore = await directoryDigest(
      path.join(repository, ".lifecycle/data"),
    );
    const targetReference = await stageProcessPackageFixture(
      repository,
      bootstrapPackage,
    );
    const before = await contractBytes(repository);
    const next = mdlm(repository, "next", "--json");
    expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
    const assignment = JSON.parse(next.stdout).assignment.id as string;

    const migrated = mdlm(
      repository,
      "process",
      "migrate",
      targetReference,
      "--json",
    );

    expect(migrated.status, `${migrated.stderr}${migrated.stdout}`).toBe(0);
    expect(JSON.parse(migrated.stdout)).toEqual(
      expect.objectContaining({
        ok: true,
        command: "process.migrate",
        installed: true,
        selected: true,
        migration: {
          from: expect.objectContaining({
            reference: "mdlm-bootstrap@0.64.0",
            digest:
              "sha256:e3759f865e15cb62a7014d1cd3c05b25bee3f2858966a1cc7ed59bfda5476c8b",
          }),
          to: expect.objectContaining({
            reference: "mdlm-bootstrap@0.65.0",
            digest:
              "sha256:585b32dad15327e6fc7822cc4ea08c42c14d63301a55b6659b7bfa63297a5c0e",
          }),
        },
        diagnostics: [],
      }),
    );
    expect(await contractBytes(repository)).not.toBe(before);
    expect(
      await directoryDigest(path.join(repository, ".lifecycle/data")),
    ).toBe(dataBefore);
    const historyAfter = mdlm(repository, "history", mapId, "--json");
    expect(
      historyAfter.status,
      `${historyAfter.stderr}${historyAfter.stdout}`,
    ).toBe(0);
    expect(JSON.parse(historyAfter.stdout).history).toEqual(
      JSON.parse(historyBefore.stdout).history,
    );
    expect(historyAfter.stdout).toContain("mdlm-bootstrap@0.64.0");
    const prepared = mdlm(
      repository,
      "scenario",
      "prepare",
      assignment,
      "--json",
    );
    expect(prepared.status, `${prepared.stderr}${prepared.stdout}`).toBe(0);
    expect(JSON.parse(prepared.stdout).assignment.id).toBe(assignment);
    expect(mdlm(repository, "doctor", "--json").status).toBe(0);
  }, 60_000);

  it("preserves exhausted 0.64.0 malformed-response history during migration", async () => {
    const previousRoot = await historicalBootstrap064Copy(parent);
    await selectProcessPackageFixture(repository, previousRoot);
    const assignment = JSON.parse(mdlm(repository, "next").stdout).assignment.id as string;
    const dataBefore = await directoryDigest(
      path.join(repository, ".lifecycle/data"),
    );

    const first = mdlmWithInput(repository, "{}\n", "scenario", "submit");
    expect(first.status).toBe(1);
    expect(JSON.parse(first.stdout)).toEqual(expect.objectContaining({
      assignment: { id: assignment },
      disposition: "correction-required",
      malformedResponse: expect.objectContaining({
        attempt: 1,
        correctionsRemaining: 1,
      }),
    }));
    const second = mdlmWithInput(repository, "{]\n", "scenario", "submit");
    expect(second.status).toBe(1);
    expect(JSON.parse(second.stdout)).toEqual(expect.objectContaining({
      assignment: { id: assignment },
      disposition: "exhausted",
      malformedResponse: expect.objectContaining({
        attempt: 2,
        correctionsRemaining: 0,
      }),
    }));
    const leasePath = path.join(
      repository,
      ".lifecycle/work/active-assignment.json",
    );
    const exhaustedBefore = JSON.parse(await fs.readFile(leasePath, "utf8"));
    expect(exhaustedBefore).toEqual(expect.objectContaining({
      id: assignment,
      disposition: "exhausted",
      package: expect.objectContaining({
        reference: "mdlm-bootstrap@0.64.0",
        digest:
          "sha256:e3759f865e15cb62a7014d1cd3c05b25bee3f2858966a1cc7ed59bfda5476c8b",
      }),
      malformedResponses: [
        expect.objectContaining({ digest: expect.stringMatching(/^sha256:/) }),
        expect.objectContaining({ digest: expect.stringMatching(/^sha256:/) }),
      ],
    }));

    const targetReference = await stageProcessPackageFixture(
      repository,
      bootstrapPackage,
    );
    const migrated = mdlm(
      repository,
      "process",
      "migrate",
      targetReference,
      "--json",
    );
    expect(migrated.status, `${migrated.stderr}${migrated.stdout}`).toBe(0);
    expect(
      await directoryDigest(path.join(repository, ".lifecycle/data")),
    ).toBe(dataBefore);
    const exhaustedAfter = JSON.parse(await fs.readFile(leasePath, "utf8"));
    expect(exhaustedAfter).toEqual(exhaustedBefore);
    expect(mdlm(repository, "doctor", "--json").status).toBe(0);

    const reevaluated = mdlm(repository, "next", "--json");
    expect(
      reevaluated.status,
      `${reevaluated.stderr}${reevaluated.stdout}`,
    ).toBe(0);
    const replacement = JSON.parse(reevaluated.stdout).assignment;
    expect(replacement.id).not.toBe(assignment);
    const prepared = mdlm(
      repository,
      "scenario",
      "prepare",
      replacement.id,
      "--json",
    );
    expect(prepared.status, `${prepared.stderr}${prepared.stdout}`).toBe(0);
    expect(JSON.parse(prepared.stdout)).toEqual(expect.objectContaining({
      assignment: expect.objectContaining({ id: replacement.id }),
      package: expect.objectContaining({
        reference: "mdlm-bootstrap@0.65.0",
      }),
      scenario: expect.objectContaining({
        reference: "establish-initial-wayfinding-map@1",
      }),
    }));
  }, 90_000);

  it("rejects an incompatible package without changing exact contract bytes", async () => {
    const previousRoot = await packageCopy(parent, "previous", "0.40.0");
    const incompatibleRoot = await packageCopy(parent, "incompatible", "0.58.0");
    const manifestPath = path.join(incompatibleRoot, "manifest.yaml");
    await fs.writeFile(
      manifestPath,
      (await fs.readFile(manifestPath, "utf8")).replace(
        "media_type: text/markdown",
        "media_type: text/plain",
      ),
    );
    await selectProcessPackageFixture(repository, previousRoot);
    const targetReference = await stageProcessPackageFixture(
      repository,
      incompatibleRoot,
    );
    const before = await contractBytes(repository);

    const migrated = mdlm(
      repository,
      "process",
      "migrate",
      targetReference,
      "--json",
    );

    expect(migrated.status).toBe(1);
    expect(JSON.parse(migrated.stdout).diagnostics).toContainEqual(
      expect.objectContaining({ code: "repository-contract-incompatible" }),
    );
    expect(await contractBytes(repository)).toBe(before);
  }, 30_000);

  it("refuses a staged package that changed after its exact digest was recorded", async () => {
    const previousRoot = await packageCopy(parent, "previous", "0.40.0");
    await selectProcessPackageFixture(repository, previousRoot);
    const targetReference = await stageProcessPackageFixture(
      repository,
      bootstrapPackage,
    );
    const targetObligation = path.join(
      repository,
      ".lifecycle/packages",
      targetReference,
      "obligations/review-context-required.yaml",
    );
    await fs.appendFile(targetObligation, "unexpected: true\n");
    const before = await contractBytes(repository);

    const migrated = mdlm(
      repository,
      "process",
      "migrate",
      targetReference,
      "--json",
    );

    expect(migrated.status).toBe(1);
    expect(JSON.parse(migrated.stdout).diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "meta-schema" }),
    ]));
    expect(await contractBytes(repository)).toBe(before);
  }, 30_000);
});

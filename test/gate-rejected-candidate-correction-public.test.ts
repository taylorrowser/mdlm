import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { mdlm, mdlmWithInput } from "./helpers/mdlm.js";

type Json = Record<string, any>;

const fixture = path.join(
  process.cwd(),
  "test/fixtures/gate-rejected-phase3-candidate/repository.bundle",
);

function input(packet: Json, name: string): Json[] {
  const found = packet.exactInputs[0].inputs.find(
    (candidate: Json) => candidate.name === name,
  );
  expect(found, `Missing exact input '${name}'`).toBeDefined();
  return found.values;
}

function revisions(packet: Json, name: string): string[] {
  return input(packet, name).map((value) => value.identity.revision_id);
}

function replacementResponse(
  packet: Json,
  definitionMembers: string[],
  evidence: string[],
): Json {
  const response = structuredClone(packet.responseScaffold);
  const replacement = response.proposal.outputs.find(
    (output: Json) => (output.output ?? output.handle) === "replacement",
  );
  expect(replacement).toBeDefined();
  const candidate = input(packet, "candidate")[0];
  if (!candidate) throw new Error("Missing exact candidate input");
  response.proposal.outputs = [{
    ...replacement,
    payload: {
      title: "Corrected Phase 3 candidate",
      kind: "level-candidate",
      role: "candidate",
      scope: candidate.data.payload.scope,
      group: candidate.data.payload.group,
      definition_members: definitionMembers,
      evidence,
    },
    body: "Replace only the exact gate-rejected candidate membership.\n",
  }];
  response.proposal.completionEvidence = {
    summary: "Applied the exact reviewed gate rejection.",
  };
  return response;
}

it("removes exact gate-rejected candidate membership at the public Assignment seam", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-gate-correction-"));
  try {
    const repository = path.join(root, "repository");
    const cloned = spawnSync("git", ["clone", "--quiet", fixture, repository], {
      encoding: "utf8",
    });
    expect(cloned.status, `${cloned.stderr}${cloned.stdout}`).toBe(0);

    const next = mdlm(repository, "next", "--json");
    expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
    const outcome = JSON.parse(next.stdout);
    expect(outcome.assignment.packet.scenario.reference).toBe(
      "revise-phase-2-candidate-after-review@2",
    );
    const packet = outcome.assignment.packet;
    const candidateRejections = revisions(packet, "gate_rejections");
    expect(candidateRejections).toHaveLength(1);
    const rejectedMembers = revisions(packet, "rejected_members");
    expect(rejectedMembers).toHaveLength(1);
    const rejectedMember = rejectedMembers[0]!;
    const unrelatedRejectedMember = "VER-3AGKPWAHK7-r00001";
    expect(rejectedMembers).not.toContain(unrelatedRejectedMember);
    const rejectedReview = input(packet, "evidence").find((value) =>
      value.data.links.some((link: Json) =>
        link.type === "reviews" && link.target === rejectedMember
      )
    )?.identity.revision_id;
    expect(rejectedReview).toBeDefined();

    const originalMembers = revisions(packet, "definition_members");
    const originalEvidence = revisions(packet, "evidence");
    expect(originalMembers).toContain(unrelatedRejectedMember);
    const unchanged = mdlmWithInput(
      repository,
      `${JSON.stringify(replacementResponse(
        packet,
        originalMembers,
        originalEvidence,
      ))}\n`,
      "scenario",
      "submit",
      "-",
      "--json",
    );
    expect(unchanged.status).toBe(1);
    expect(JSON.parse(unchanged.stdout)).toEqual(expect.objectContaining({
      outcome: "rejected",
      correctionConsumed: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "scenario-completion-failed" }),
      ]),
    }));

    const corrected = mdlmWithInput(
      repository,
      `${JSON.stringify(replacementResponse(
        packet,
        originalMembers.filter((revision) => revision !== rejectedMember),
        originalEvidence.filter((revision) => revision !== rejectedReview),
      ))}\n`,
      "scenario",
      "submit",
      "-",
      "--json",
    );
    expect(corrected.status, `${corrected.stderr}${corrected.stdout}`).toBe(0);
    const accepted = JSON.parse(corrected.stdout);
    expect(accepted.outcome).toBe("accepted");
    const replacement = accepted.receipt.publications.find(
      (publication: Json) => publication.handle === "replacement",
    ).revisionId;

    const shown = mdlm(repository, "show", replacement, "--json");
    expect(shown.status, `${shown.stderr}${shown.stdout}`).toBe(0);
    const payload = JSON.parse(shown.stdout).lifecycleDatum.datum.payload;
    expect(payload.definition_members).not.toContain(rejectedMember);
    expect(payload.definition_members).toContain(unrelatedRejectedMember);
    expect(payload.evidence).not.toContain(rejectedReview);
    expect(payload.definition_members).toHaveLength(originalMembers.length - 1);
    expect(payload.evidence).toHaveLength(originalEvidence.length - 1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

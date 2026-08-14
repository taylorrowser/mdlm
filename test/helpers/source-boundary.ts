import { createHash } from "node:crypto";
import { mdlm, mdlmWithInput } from "./mdlm.js";

export async function freezeQuestionSource(
  repositoryRoot: string,
  revisionId: string,
): Promise<Record<string, unknown>> {
  const projected = mdlm(
    repositoryRoot,
    "loose-ends",
    "--phase",
    "phase-0-wayfinding",
    "--json",
  );
  if (projected.status !== 0) {
    throw new Error(`${projected.stderr}${projected.stdout}`);
  }
  const obligation = JSON.parse(projected.stdout).looseEnds.items.find(
    (item: Record<string, unknown>) =>
      item.obligation === "source-boundary-required" &&
      item.subject === revisionId,
  ) as Record<string, unknown> | undefined;
  if (!obligation || typeof obligation.id !== "string") {
    throw new Error(`No source-boundary Obligation for '${revisionId}'`);
  }
  const next = mdlm(repositoryRoot, "next");
  if (next.status !== 0) throw new Error(`${next.stderr}${next.stdout}`);
  const assignment = JSON.parse(next.stdout).assignment.id as string;
  const prepared = mdlm(repositoryRoot, "scenario", "prepare", assignment);
  if (prepared.status !== 0) {
    throw new Error(`${prepared.stderr}${prepared.stdout}`);
  }
  const packet = JSON.parse(prepared.stdout);
  if (packet.scenario.reference !== "freeze-source-boundary@1") {
    throw new Error(
      `Expected freeze-source-boundary@1, received ${packet.scenario.reference}`,
    );
  }
  const suffix = createHash("sha256").update(revisionId).digest("hex")
    .slice(0, 10).toUpperCase();
  const submitted = mdlmWithInput(
    repositoryRoot,
    `${JSON.stringify({
      contract: "mdlm-assignment-response@1",
      assignment,
      kind: "proposal",
      proposal: {
        outputs: [{
          localId: "boundary",
          name: "boundary",
          invocation: 0,
          lifecycleDatum: {
            type: "BSL",
            payload: {
              title: "Exact source boundary",
              kind: "source-boundary",
              role: "source-boundary",
              scope: revisionId,
              group: "SAME-LINEAGE",
              definition_members: [revisionId],
              evidence: [],
            },
            links: [],
            body: "Freezes exactly the editable source Revision.\n",
          },
        }],
        completionEvidence: { summary: "Exact source Revision frozen." },
        loadedSkillRefs: packet.prompt.skills.map(
          (skill: { reference: string }) => skill.reference,
        ),
        authoritySupplies: [],
        standingDelegations: [],
      },
    })}\n`,
    "scenario",
    "submit",
  );
  if (submitted.status !== 0) {
    throw new Error(`${submitted.stderr}${submitted.stdout}`);
  }
  return JSON.parse(submitted.stdout).execution;
}

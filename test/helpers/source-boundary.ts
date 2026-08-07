import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { req } from "./req.js";

export async function freezeQuestionSource(
  repositoryRoot: string,
  revisionId: string,
): Promise<Record<string, unknown>> {
  const projected = req(
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
  const suffix = createHash("sha256").update(revisionId).digest("hex")
    .slice(0, 10).toUpperCase();
  const executable = path.join(repositoryRoot, `source-boundary-${suffix}.mjs`);
  await fs.writeFile(
    executable,
    `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify({
      outputs: [{
        name: "boundary",
        invocation: 0,
        lifecycleDatum: {
          id: `BSL-${suffix}`,
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
    }))});\n`,
    { mode: 0o755 },
  );
  const executed = req(
    repositoryRoot,
    "scenario",
    "execute",
    "freeze-source-boundary@1",
    "--obligation",
    obligation.id,
    "--adapter",
    executable,
    "--input",
    `source=${revisionId}`,
    "--json",
  );
  if (executed.status !== 0) {
    throw new Error(`${executed.stderr}${executed.stdout}`);
  }
  return JSON.parse(executed.stdout).execution;
}

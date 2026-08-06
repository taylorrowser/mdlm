import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export async function copiedProcessPackage(
  prefix = "mdlm-process-",
): Promise<string> {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const processRoot = path.join(temporaryRoot, "process");
  await fs.cp(path.join(process.cwd(), ".lifecycle/process"), processRoot, {
    recursive: true,
  });
  return processRoot;
}

export async function distinctProgressionProcessPackage(
  prefix = "mdlm-distinct-progression-",
): Promise<string> {
  const processRoot = await copiedProcessPackage(prefix);
  const manifestPath = path.join(processRoot, "manifest.yaml");
  const manifest = await fs.readFile(manifestPath, "utf8");
  await fs.writeFile(
    manifestPath,
    manifest.replace("id: mdlm-bootstrap", "id: mdlm-distinct-progression"),
  );
  const phasePath = path.join(processRoot, "phases/phase-0-wayfinding.yaml");
  const phase = await fs.readFile(phasePath, "utf8");
  await fs.writeFile(
    phasePath,
    phase.replace(
      /    condition: >-[\s\S]*?    policy_ref: phase-progression-participation@1/,
      `    condition: >-\n      every("candidate-baselines-of-kind@1",\n        {baseline_kind: "intent-level-candidate"}, candidate =>\n          exists("applicable-disposition-decisions-for@1",\n            {subject: candidate, decision_kind: "scope"}))\n    policy_ref: phase-progression-participation@1`,
    ).replace(
      "    scenario: record-gate-signoff@2\n    subjects:",
      "    scenario: record-consequential-decision@1\n    subjects:",
    ).replace(
      "    evidence_selector: applicable-gate-signoffs-for@1",
      "    evidence_selector: applicable-disposition-decisions-for@1",
    ),
  );
  return processRoot;
}

export async function renamedBaselineProcessPackage(
  prefix = "mdlm-process-",
): Promise<string> {
  const processRoot = await copiedProcessPackage(prefix);
  const replaceInYamlFiles = async (directory: string): Promise<void> => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await replaceInYamlFiles(entryPath);
      else if (entry.name.endsWith(".yaml")) {
        const source = await fs.readFile(entryPath, "utf8");
        await fs.writeFile(entryPath, source.replaceAll("BSL", "SNP"));
      }
    }
  };
  await replaceInYamlFiles(processRoot);
  return processRoot;
}

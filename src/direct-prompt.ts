import { createHash } from "node:crypto";
import type { ProcessPackage, ProcessDiagnostic } from "./index.js";
import { readPackageMarkdownAsset, promptSkillReferences } from "./markdown-asset.js";
export interface ResolvedProcessAsset {
  reference: string;
  path: string;
  digest: string;
  content: string;
}

export interface ResolvedPrompt extends ResolvedProcessAsset {
  skills: ResolvedProcessAsset[];
}

function sha256(content: string): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

async function resolvedAsset(
  processPackage: ProcessPackage,
  reference: string,
  kind: "prompt" | "skill" | "policy-asset",
): Promise<{ asset?: ResolvedProcessAsset; diagnostic?: ProcessDiagnostic }> {
  try {
    const read = await readPackageMarkdownAsset(processPackage.root, reference);
    if (!read.ok) {
      return {
        diagnostic: {
          code: read.reason === "invalid-reference"
            ? `invalid-${kind}-reference`
            : `${kind}-${read.reason}`,
          path: read.path,
          message: read.message,
        },
      };
    }
    return {
      asset: {
        reference,
        path: read.asset.relativePath,
        digest: sha256(read.asset.content),
        content: read.asset.content,
      },
    };
  } catch (error) {
    return {
      diagnostic: {
        code: `${kind}-unavailable`,
        path: reference,
        message: `Could not resolve ${kind} '${reference}': ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}

export async function resolvePrompt(
  processPackage: ProcessPackage,
  reference: string,
): Promise<{ prompt?: ResolvedPrompt; diagnostics: ProcessDiagnostic[] }> {
  const resolved = await resolvedAsset(processPackage, reference, "prompt");
  if (!resolved.asset) {
    return { diagnostics: resolved.diagnostic ? [resolved.diagnostic] : [] };
  }
  const skillDeclaration = promptSkillReferences(resolved.asset.content);
  if (!skillDeclaration.ok) {
    return {
      diagnostics: [{
        code: "prompt-skills-invalid",
        path: resolved.asset.path,
        message: `Prompt '${reference}' must declare an ordered unique array of exact skill references`,
      }],
    };
  }
  const skillReferences = skillDeclaration.references;
  const skills: ResolvedProcessAsset[] = [];
  const diagnostics: ProcessDiagnostic[] = [];
  for (const skillReference of skillReferences) {
    const skill = await resolvedAsset(processPackage, skillReference, "skill");
    if (skill.asset) skills.push(skill.asset);
    if (skill.diagnostic) diagnostics.push(skill.diagnostic);
  }
  return {
    ...(diagnostics.length === 0
      ? { prompt: { ...resolved.asset, skills } }
      : {}),
    diagnostics,
  };
}


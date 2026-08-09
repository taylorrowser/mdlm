import type { ProcessPackage, VersionedDefinition } from "./index.js";

export interface SelectedImplementationProfile {
  reference: string;
  definition: VersionedDefinition;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

/** Resolve the package's one exact default implementation Profile. */
export function selectedImplementationProfile(
  processPackage: ProcessPackage,
): SelectedImplementationProfile | undefined {
  const reference = record(processPackage.manifest.profiles)?.default;
  if (typeof reference !== "string") return undefined;
  const match = /^(.*)@([1-9][0-9]*)$/.exec(reference);
  const definition = match?.[1]
    ? processPackage.profiles[match[1]]
    : undefined;
  return definition?.version === Number(match?.[2])
    ? { reference, definition }
    : undefined;
}

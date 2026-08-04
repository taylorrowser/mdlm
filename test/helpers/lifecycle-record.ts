import type { LifecycleRecord } from "../../src/index.js";

export function lifecycleRecord(
  type: string,
  id: string,
  payload: Record<string, unknown>,
  options: {
    revision?: number;
    links?: { type: string; target: string }[];
    createdBy: LifecycleRecord["datum"]["created_by"];
    storage: LifecycleRecord["storage"];
  },
): LifecycleRecord {
  const revision = options.revision ?? 1;
  return {
    datum: {
      id,
      revision,
      revision_id: `${id}-r${String(revision).padStart(5, "0")}`,
      type,
      payload,
      links: options.links ?? [],
      created_by: options.createdBy,
      body: "",
    },
    storage: options.storage,
    integrity: {
      parseable: true,
      schema_valid: true,
      identity_valid: true,
      references_valid: true,
      hash_valid: true,
    },
  };
}

/** Parse one package-authored reference to an exact bound Scenario input. */
export function scenarioInputRevisionReference(
  value: unknown,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^\$input\.([A-Za-z][A-Za-z0-9_-]*)\.revision_id$/.exec(
    value,
  );
  return match?.[1];
}

/** Parse one package-authored reference to a scalar in an exact input payload. */
export function scenarioInputPayloadReference(
  value: unknown,
): { input: string; path: string } | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^\$input\.([A-Za-z][A-Za-z0-9_-]*)\.payload\.([A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z][A-Za-z0-9_-]*)*)$/.exec(
    value,
  );
  return match?.[1] && match[2]
    ? { input: match[1], path: match[2] }
    : undefined;
}

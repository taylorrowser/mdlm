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

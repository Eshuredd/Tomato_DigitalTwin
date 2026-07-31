export function optionalFiniteNumber(
  value: string,
  fieldName: string,
): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldName} must be a finite number.`);
  }
  return parsed;
}

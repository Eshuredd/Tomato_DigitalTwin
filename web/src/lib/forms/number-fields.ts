import { z } from "zod";

// Form-boundary policy: required blank/null values fail, while optional blank,
// whitespace-only, null, and undefined values are omitted. Explicit zero stays zero.

function finiteNumber(
  value: unknown,
  context: z.RefinementCtx,
  label: string,
  required: boolean,
) {
  if (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "")
  ) {
    if (required) {
      context.addIssue({ code: "custom", message: `${label} is required.` });
      return z.NEVER;
    }

    return undefined;
  }

  const parsed = typeof value === "string" ? Number(value.trim()) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed)) {
    context.addIssue({
      code: "custom",
      message: `${label} must be a valid number.`,
    });
    return z.NEVER;
  }

  return parsed;
}

export function requiredFiniteNumber(label: string) {
  return z.unknown().transform((value, context) =>
    finiteNumber(value, context, label, true),
  );
}

export function optionalFiniteNumber(label: string) {
  return z.unknown().transform((value, context) =>
    finiteNumber(value, context, label, false),
  );
}

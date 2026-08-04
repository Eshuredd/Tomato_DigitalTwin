import type { components } from "@/lib/api/schema";
import type { AcceptedIrrigation } from "./irrigation/irrigation-draft";

export type LastIrrigationEvent = components["schemas"]["LastIrrigationEvent"];

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortCanonical(value));
}

function sortCanonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortCanonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortCanonical(item)]));
  }
  return value;
}

export interface StableIdentity { signature: string; id: string }

export function stableIdentity(current: StableIdentity | undefined, signature: string): StableIdentity {
  return current?.signature === signature ? current : { signature, id: crypto.randomUUID() };
}

export function materializeIrrigation(accepted: AcceptedIrrigation, eventId: string | undefined): LastIrrigationEvent | null {
  if (accepted.mode === "none") return null;
  if (!eventId || accepted.amountMm === null || !accepted.timestamp || !accepted.source) {
    throw new Error("Accepted irrigation cannot be materialized without a complete stable event identity.");
  }
  return { irrigation_event_id: eventId, timestamp: accepted.timestamp, amount_mm: accepted.amountMm, source: accepted.source };
}

export function irrigationIdentity(current: StableIdentity | undefined, accepted: AcceptedIrrigation): StableIdentity | undefined {
  return accepted.mode === "none" ? undefined : stableIdentity(current, accepted.semanticSignature);
}

import type { IrrigationEventSource, LastIrrigationEvent } from "@/lib/types/api";

export type IrrigationMode = "none" | "direct" | "litres_area" | "drip_runtime";

export interface IrrigationDraftResult {
  valid: boolean;
  event: LastIrrigationEvent | null;
  signature: string;
  error: string | null;
}

export function irrigationDepthFromLitresArea({
  totalLitres,
  irrigatedAreaM2,
}: {
  totalLitres: number;
  irrigatedAreaM2: number;
}): number {
  const litres = finiteNumber(totalLitres, "Total water applied (litres)");
  const area = finiteNumber(irrigatedAreaM2, "Irrigated area (m2)");
  if (litres < 0) {
    throw new Error("Total water applied (litres) must be >= 0.");
  }
  if (area <= 0) {
    throw new Error("Irrigated area (m2) must be greater than 0.");
  }
  return litres / area;
}

export function dripRuntimeToLitresAndDepth({
  emitterCount,
  emitterFlowLph,
  runtimeMinutes,
  irrigatedAreaM2,
}: {
  emitterCount: number;
  emitterFlowLph: number;
  runtimeMinutes: number;
  irrigatedAreaM2: number;
}): { runtimeHours: number; totalLitres: number; amountMm: number } {
  if (!Number.isInteger(emitterCount) || emitterCount <= 0) {
    throw new Error("Emitter count must be a positive integer.");
  }
  const flow = finiteNumber(emitterFlowLph, "Emitter flow (litres/hour)");
  const runtime = finiteNumber(runtimeMinutes, "Runtime (minutes)");
  const area = finiteNumber(irrigatedAreaM2, "Irrigated area (m2)");
  if (flow <= 0) {
    throw new Error("Emitter flow (litres/hour) must be greater than 0.");
  }
  if (runtime < 0) {
    throw new Error("Runtime (minutes) must be >= 0.");
  }
  if (area <= 0) {
    throw new Error("Irrigated area (m2) must be greater than 0.");
  }
  const runtimeHours = runtime / 60;
  const totalLitres = emitterCount * flow * runtimeHours;
  return {
    runtimeHours,
    totalLitres,
    amountMm: irrigationDepthFromLitresArea({
      totalLitres,
      irrigatedAreaM2: area,
    }),
  };
}

export function buildLastIrrigationEvent({
  amountMm,
  eventId,
  source,
  timestamp,
}: {
  amountMm: number;
  eventId: string;
  source: IrrigationEventSource;
  timestamp: string;
}): LastIrrigationEvent | null {
  const amount = finiteNumber(amountMm, "Irrigation depth (mm)");
  if (amount < 0) {
    throw new Error("Irrigation depth (mm) must be >= 0.");
  }
  if (amount === 0) {
    return null;
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.valueOf())) {
    throw new Error("Irrigation timestamp is invalid.");
  }
  return {
    irrigation_event_id: eventId,
    timestamp: date.toISOString(),
    amount_mm: amount,
    source,
  };
}

export function stableIrrigationSignature(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as object).sort());
}

export function generateIrrigationEventId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `irrigation-${Date.now()}-${Math.random()}`;
}

function finiteNumber(value: number, fieldName: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number.`);
  }
  return value;
}

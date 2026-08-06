import { awareIsoFromLocalDateTime } from "@/lib/dates/local-date";

export type IrrigationMode = "none" | "direct" | "litres_area" | "drip_runtime";
export type IrrigationSource = "MANUAL" | "CONVERTED_FROM_LITRES" | "CONVERTED_FROM_DRIP_RUNTIME";

export interface IrrigationDraft {
  mode: IrrigationMode;
  timestamp: string;
  directDepth: string;
  totalLitres: string;
  litresArea: string;
  emitterCount: string;
  emitterFlow: string;
  runtimeMinutes: string;
  dripArea: string;
}

export interface AcceptedIrrigation {
  stateId: string;
  mode: IrrigationMode;
  amountMm: number | null;
  timestamp: string | null;
  source: IrrigationSource | null;
  inputDetails: Record<string, number | string>;
  semanticSignature: string;
  distinction: "no_irrigation" | "explicit_zero" | "positive_depth";
}

function finite(value: number, label: string) { if (!Number.isFinite(value)) throw new Error(`${label} must be a finite number.`); return value; }
function inputNumber(value: string, label: string) { if (!value.trim()) throw new Error(`${label} is required.`); return finite(Number(value), label); }

export function irrigationDepthFromLitres(totalLitres: number, irrigatedAreaM2: number) {
  const litres = finite(totalLitres, "Total litres");
  const area = finite(irrigatedAreaM2, "Irrigated area");
  if (litres < 0) throw new Error("Total litres must be non-negative.");
  if (area <= 0) throw new Error("Irrigated area must be greater than zero.");
  return litres / area;
}

export function dripRuntimeConversion(emitterCount: number, emitterFlowLph: number, runtimeMinutes: number, irrigatedAreaM2: number) {
  if (!Number.isInteger(emitterCount) || emitterCount <= 0) throw new Error("Emitter count must be a positive integer.");
  const flow = finite(emitterFlowLph, "Emitter flow");
  const runtime = finite(runtimeMinutes, "Runtime");
  if (flow <= 0) throw new Error("Emitter flow must be greater than zero.");
  if (runtime < 0) throw new Error("Runtime must be non-negative.");
  const runtimeHours = runtime / 60;
  const totalLitres = emitterCount * flow * runtimeHours;
  return { runtimeHours, totalLitres, amountMm: irrigationDepthFromLitres(totalLitres, irrigatedAreaM2) };
}

export function acceptIrrigationDraft(stateId: string, draft: IrrigationDraft): AcceptedIrrigation {
  if (draft.mode === "none") return finish({ stateId, mode: draft.mode, amountMm: null, timestamp: null, source: null, inputDetails: {}, distinction: "no_irrigation" });
  const timestamp = awareIsoFromLocalDateTime(draft.timestamp);
  if (draft.mode === "direct") {
    const amountMm = inputNumber(draft.directDepth, "Irrigation depth");
    if (amountMm < 0) throw new Error("Irrigation depth must be non-negative.");
    return finish({ stateId, mode: draft.mode, amountMm, timestamp, source: "MANUAL", inputDetails: { amount_mm: amountMm }, distinction: amountMm === 0 ? "explicit_zero" : "positive_depth" });
  }
  if (draft.mode === "litres_area") {
    const totalLitres = inputNumber(draft.totalLitres, "Total litres");
    const irrigatedAreaM2 = inputNumber(draft.litresArea, "Irrigated area");
    const amountMm = irrigationDepthFromLitres(totalLitres, irrigatedAreaM2);
    return finish({ stateId, mode: draft.mode, amountMm, timestamp, source: "CONVERTED_FROM_LITRES", inputDetails: { total_litres: totalLitres, irrigated_area_m2: irrigatedAreaM2 }, distinction: amountMm === 0 ? "explicit_zero" : "positive_depth" });
  }
  const emitterCount = inputNumber(draft.emitterCount, "Emitter count");
  const emitterFlowLph = inputNumber(draft.emitterFlow, "Emitter flow");
  const runtimeMinutes = inputNumber(draft.runtimeMinutes, "Runtime");
  const irrigatedAreaM2 = inputNumber(draft.dripArea, "Irrigated area");
  const conversion = dripRuntimeConversion(emitterCount, emitterFlowLph, runtimeMinutes, irrigatedAreaM2);
  return finish({ stateId, mode: draft.mode, amountMm: conversion.amountMm, timestamp, source: "CONVERTED_FROM_DRIP_RUNTIME", inputDetails: { emitter_count: emitterCount, emitter_flow_lph: emitterFlowLph, runtime_minutes: runtimeMinutes, runtime_hours: conversion.runtimeHours, irrigated_area_m2: irrigatedAreaM2, total_litres: conversion.totalLitres }, distinction: conversion.amountMm === 0 ? "explicit_zero" : "positive_depth" });
}

function finish(value: Omit<AcceptedIrrigation, "semanticSignature">): AcceptedIrrigation {
  return { ...value, semanticSignature: JSON.stringify(value) };
}

export function currentIrrigationSignature(stateId: string, draft: IrrigationDraft) {
  try { return acceptIrrigationDraft(stateId, draft).semanticSignature; } catch { return undefined; }
}

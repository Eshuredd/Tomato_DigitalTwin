import { describe, expect, it } from "vitest";
import { acceptIrrigationDraft, dripRuntimeConversion, irrigationDepthFromLitres, type IrrigationDraft } from "./irrigation-draft";

const base: IrrigationDraft = { mode: "none", timestamp: "2026-08-04T10:30", directDepth: "0", totalLitres: "0", litresArea: "10", emitterCount: "10", emitterFlow: "2", runtimeMinutes: "30", dripArea: "10" };

describe("irrigation conversions", () => {
  it("converts litres divided by area to millimetres", () => expect(irrigationDepthFromLitres(25, 10)).toBe(2.5));
  it("retains zero litres as valid zero", () => expect(irrigationDepthFromLitres(0, 10)).toBe(0));
  it.each([[-1, 10], [10, 0], [10, -1]])("rejects invalid litres/area %s/%s", (litres, area) => expect(() => irrigationDepthFromLitres(litres, area)).toThrow());
  it("converts drip minutes, litres, and depth without rounding", () => expect(dripRuntimeConversion(3, 2.5, 17, 7)).toEqual({ runtimeHours: 17 / 60, totalLitres: 3 * 2.5 * (17 / 60), amountMm: (3 * 2.5 * (17 / 60)) / 7 }));
  it.each([[1.5, 2, 10, 10], [0, 2, 10, 10], [1, 0, 10, 10], [1, 2, -1, 10]] as const)("rejects invalid drip input", (emitters, flow, runtime, area) => expect(() => dripRuntimeConversion(emitters, flow, runtime, area)).toThrow());
  it("distinguishes no irrigation from explicit direct zero", () => { const none = acceptIrrigationDraft("state-1", base); const zero = acceptIrrigationDraft("state-1", { ...base, mode: "direct" }); expect(none.distinction).toBe("no_irrigation"); expect(zero.distinction).toBe("explicit_zero"); expect(none.semanticSignature).not.toBe(zero.semanticSignature); });
  it("prepares litres and drip source enums", () => { expect(acceptIrrigationDraft("state-1", { ...base, mode: "litres_area" }).source).toBe("CONVERTED_FROM_LITRES"); expect(acceptIrrigationDraft("state-1", { ...base, mode: "drip_runtime" }).source).toBe("CONVERTED_FROM_DRIP_RUNTIME"); });
  it("rejects an invalid timestamp", () => expect(() => acceptIrrigationDraft("state-1", { ...base, mode: "direct", timestamp: "bad" })).toThrow());
  it("converts local datetime to an aware absolute timestamp", () => expect(acceptIrrigationDraft("state-1", { ...base, mode: "direct" }).timestamp).toMatch(/Z$/));
  it("changes signature after an accepted input edit", () => expect(acceptIrrigationDraft("state-1", { ...base, mode: "direct" }).semanticSignature).not.toBe(acceptIrrigationDraft("state-1", { ...base, mode: "direct", directDepth: "1" }).semanticSignature));
});

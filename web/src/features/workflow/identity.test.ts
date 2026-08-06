import { describe, expect, it } from "vitest";
import { acceptIrrigationDraft, type IrrigationDraft } from "./irrigation/irrigation-draft";
import { canonicalJson, irrigationIdentity, materializeIrrigation, stableIdentity } from "./identity";
const base: IrrigationDraft = { mode: "none", timestamp: "2026-08-04T06:30", directDepth: "0", totalLitres: "10", litresArea: "3", emitterCount: "3", emitterFlow: "2", runtimeMinutes: "20", dripArea: "4" };
describe("canonical request and irrigation identity", () => {
  it("sorts recursively and omits undefined", () => expect(canonicalJson({ z: { b: 2, a: 1 }, a: undefined })).toBe('{"z":{"a":1,"b":2}}'));
  it("ignores key insertion order", () => expect(canonicalJson({ b: 2, a: 1 })).toBe(canonicalJson({ a: 1, b: 2 })));
  it("reuses an identity for an exact semantic retry", () => { const first = stableIdentity(undefined, "same"); expect(stableIdentity(first, "same")).toBe(first); });
  it("creates a new identity after a semantic change", () => { const first = stableIdentity(undefined, "one"); expect(stableIdentity(first, "two").id).not.toBe(first.id); });
  it("materializes no irrigation as null without an event ID", () => { const accepted = acceptIrrigationDraft("state-1", base); expect(irrigationIdentity(undefined, accepted)).toBeUndefined(); expect(materializeIrrigation(accepted, undefined)).toBeNull(); });
  it("preserves explicit zero as a real MANUAL event", () => { const accepted = acceptIrrigationDraft("state-1", { ...base, mode: "direct" }); const identity = irrigationIdentity(undefined, accepted)!; expect(materializeIrrigation(accepted, identity.id)).toMatchObject({ irrigation_event_id: identity.id, amount_mm: 0, source: "MANUAL" }); });
  it("keeps litre conversion at full precision", () => { const accepted = acceptIrrigationDraft("state-1", { ...base, mode: "litres_area" }); expect(materializeIrrigation(accepted, "event")).toMatchObject({ amount_mm: 10 / 3, source: "CONVERTED_FROM_LITRES" }); });
  it("keeps drip conversion at full precision", () => { const accepted = acceptIrrigationDraft("state-1", { ...base, mode: "drip_runtime" }); expect(materializeIrrigation(accepted, "event")).toMatchObject({ amount_mm: 0.5, source: "CONVERTED_FROM_DRIP_RUNTIME" }); });
});

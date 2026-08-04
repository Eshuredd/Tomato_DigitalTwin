import { describe, expect, it } from "vitest";
import { actualActionCreateSchema, historyEventSchema, locationFormSchema, locationPayload, narrationSchema, plotFormSchema, recommendationSchema, simulateActionsResponseSchema } from "./contracts";

describe("Milestone 2 form contracts", () => {
  const baseLocation = {
    name: "North field",
    latitude: "17.3",
    longitude: "78.4",
    elevation_m: "",
  };

  it.each(["", "   ", null, undefined])(
    "rejects missing required latitude value %j",
    (latitude) => {
      const result = locationFormSchema.safeParse({ ...baseLocation, latitude });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.latitude).toContain(
          "Latitude is required.",
        );
      }
    },
  );

  it.each(["", "\t", null, undefined])(
    "rejects missing required longitude value %j",
    (longitude) => {
      const result = locationFormSchema.safeParse({ ...baseLocation, longitude });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.longitude).toContain(
          "Longitude is required.",
        );
      }
    },
  );

  it.each(["north", "1.2.3", Number.NaN, Number.POSITIVE_INFINITY, {}])(
    "rejects malformed or non-finite coordinates (%j)",
    (latitude) => {
      expect(
        locationFormSchema.safeParse({ ...baseLocation, latitude }).success,
      ).toBe(false);
    },
  );

  it("rejects non-numeric and non-finite longitude values", () => {
    for (const longitude of ["east", Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(
        locationFormSchema.safeParse({ ...baseLocation, longitude }).success,
      ).toBe(false);
    }
  });

  it("accepts inclusive coordinate boundaries", () => {
    for (const latitude of [-90, 90]) {
      expect(
        locationFormSchema.safeParse({ ...baseLocation, latitude }).success,
      ).toBe(true);
    }
    for (const longitude of [-180, 180]) {
      expect(
        locationFormSchema.safeParse({ ...baseLocation, longitude }).success,
      ).toBe(true);
    }
  });

  it("rejects every coordinate outside its inclusive bounds", () => {
    for (const latitude of [-90.01, 90.01]) {
      expect(
        locationFormSchema.safeParse({ ...baseLocation, latitude }).success,
      ).toBe(false);
    }
    for (const longitude of [-180.01, 180.01]) {
      expect(
        locationFormSchema.safeParse({ ...baseLocation, longitude }).success,
      ).toBe(false);
    }
  });

  it("accepts explicit zero and negative coordinates", () => {
    const zero = locationFormSchema.parse({
      ...baseLocation,
      latitude: "0",
      longitude: 0,
    });
    const negative = locationFormSchema.parse({
      ...baseLocation,
      latitude: "-17.3",
      longitude: -78.4,
    });

    expect(locationPayload(zero)).toMatchObject({ latitude: 0, longitude: 0 });
    expect(locationPayload(negative)).toMatchObject({
      latitude: -17.3,
      longitude: -78.4,
    });
  });

  it.each(["", "   ", null, undefined])(
    "omits optional elevation value %j rather than coercing it to zero",
    (elevation_m) => {
      const location = locationFormSchema.parse({
        ...baseLocation,
        elevation_m,
      });
      expect(locationPayload(location)).toEqual({
        name: "North field",
        latitude: 17.3,
        longitude: 78.4,
      });
    },
  );

  it("omits blank optional elevation rather than coercing it to zero", () => {
    const location = locationFormSchema.parse(baseLocation);
    expect(locationPayload(location)).toEqual({ name: "North field", latitude: 17.3, longitude: 78.4 });
  });

  it.each(["0", 0, "542", -20])(
    "retains explicit finite elevation %j",
    (elevation_m) => {
      const location = locationFormSchema.parse({
        ...baseLocation,
        elevation_m,
      });
      expect(locationPayload(location).elevation_m).toBe(Number(elevation_m));
    },
  );

  it.each(["high", Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects malformed or non-finite elevation %j",
    (elevation_m) => {
      expect(
        locationFormSchema.safeParse({ ...baseLocation, elevation_m }).success,
      ).toBe(false);
    },
  );

  it("enforces coordinate and elevation ranges", () => {
    const plot = plotFormSchema.parse({ name: "Plot A", location: { name: "Field", latitude: "17.3", longitude: "78.4", elevation_m: "542" }, soil_texture: "loam" });
    expect(() => plotFormSchema.parse({ ...plot, location: { ...plot.location, latitude: 91 } })).toThrow();
    expect(() => plotFormSchema.parse({ ...plot, location: { ...plot.location, longitude: -181 } })).toThrow();
    expect(() => plotFormSchema.parse({ ...plot, location: { ...plot.location, elevation_m: -501 } })).toThrow();
  });
});

describe("decision and record runtime contracts", () => {
  it("rejects malformed finite values and naive timestamps", () => { expect(simulateActionsResponseSchema.safeParse({ state_id: "s", simulations: [{ action: "IRRIGATE_NOW", projected_root_zone_depletion: Number.NaN, projected_raw_crossing: false, projected_stress_band: "low", projected_water_use: 1, disease_wetness_risk_note: "" }], simulated_at: "2026-08-04T00:00:00Z" }).success).toBe(false); expect(historyEventSchema.safeParse({ timestamp: "2026-08-04T00:00:00", growth_stage: "initial", predicted_label: "healthy", root_zone_depletion: 1, stress_band: "low" }).success).toBe(false); });
  it("preserves optional amount and explicit zero and enforces notes length", () => { const base = { action: "IRRIGATE_NOW", performed_at: "2026-08-04T00:00:00Z" }; expect(actualActionCreateSchema.parse(base)).not.toHaveProperty("amount_mm"); expect(actualActionCreateSchema.parse({ ...base, amount_mm: 0 }).amount_mm).toBe(0); expect(actualActionCreateSchema.safeParse({ ...base, notes: "x".repeat(1001) }).success).toBe(false); });
  it("validates recommendation constraints, caution enums, and exact narration text fields", () => { const rec = { state_id: "s", chosen_action: "IRRIGATE_NOW", irrigation_constraint: "BAD", inspection_advisory: false, decision_reason_codes: [], caution_reasons: [], evidence_summary_structured: {}, recommended_at: "2026-08-04T00:00:00Z" }; expect(recommendationSchema.safeParse(rec).success).toBe(false); expect(narrationSchema.parse({ state_id: "s", headline: "Exact", rationale: "Backend text", caution: null }).rationale).toBe("Backend text"); });
});

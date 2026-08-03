import { describe, expect, it } from "vitest";
import { locationFormSchema, locationPayload, plotFormSchema } from "./contracts";

describe("Milestone 2 form contracts", () => {
  it("omits blank optional elevation rather than coercing it to zero", () => {
    const location = locationFormSchema.parse({ name: "North field", latitude: "17.3", longitude: "78.4", elevation_m: "" });
    expect(locationPayload(location)).toEqual({ name: "North field", latitude: 17.3, longitude: 78.4 });
  });

  it("parses explicit elevation and enforces coordinate ranges", () => {
    const plot = plotFormSchema.parse({ name: "Plot A", location: { name: "Field", latitude: "17.3", longitude: "78.4", elevation_m: "542" }, soil_texture: "loam" });
    expect(locationPayload(plot.location).elevation_m).toBe(542);
    expect(() => plotFormSchema.parse({ ...plot, location: { ...plot.location, latitude: 91 } })).toThrow();
  });
});

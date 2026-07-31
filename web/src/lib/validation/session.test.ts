import { describe, expect, it } from "vitest";
import { buildCreateSessionRequest } from "./session";

function formDataWithElevation(elevation: string): FormData {
  const formData = new FormData();
  formData.set("planting_date", "2026-07-01");
  formData.set("location_name", "Farm");
  formData.set("latitude", "17.3");
  formData.set("longitude", "78.4");
  formData.set("soil_texture", "sandy_loam");
  formData.set("elevation_m", elevation);
  return formData;
}

describe("buildCreateSessionRequest", () => {
  it("omits blank optional elevation", () => {
    expect(buildCreateSessionRequest(formDataWithElevation("   ")).location).not.toHaveProperty("elevation_m");
  });

  it("includes finite optional elevation", () => {
    expect(buildCreateSessionRequest(formDataWithElevation("542")).location.elevation_m).toBe(542);
  });

  it("rejects invalid optional elevation", () => {
    expect(() => buildCreateSessionRequest(formDataWithElevation("NaN"))).toThrow("Elevation must be a finite number.");
  });
});

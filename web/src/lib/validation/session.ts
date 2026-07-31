import type { CreateSessionRequest, SoilTexture } from "@/lib/types/api";
import { optionalFiniteNumber } from "./numbers";

export const SOIL_TEXTURE_OPTIONS: SoilTexture[] = [
  "sand",
  "sandy_loam",
  "loam",
  "silty_loam",
  "clay_loam",
  "clay",
];

export function buildCreateSessionRequest(formData: FormData): CreateSessionRequest {
  const elevation = optionalFiniteNumber(textValue(formData, "elevation_m"), "Elevation");
  return {
    crop_type: "tomato",
    planting_date: requiredText(formData, "planting_date"),
    location: {
      name: requiredText(formData, "location_name"),
      latitude: requiredNumber(formData, "latitude"),
      longitude: requiredNumber(formData, "longitude"),
      ...(elevation !== undefined ? { elevation_m: elevation } : {}),
    },
    soil_texture: requiredText(formData, "soil_texture") as SoilTexture,
  };
}

function requiredText(formData: FormData, key: string): string {
  const value = textValue(formData, key);
  if (!value) {
    throw new Error(`${key} is required.`);
  }
  return value;
}

function textValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function requiredNumber(formData: FormData, key: string): number {
  const value = requiredText(formData, key);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${key} must be a finite number.`);
  }
  return parsed;
}

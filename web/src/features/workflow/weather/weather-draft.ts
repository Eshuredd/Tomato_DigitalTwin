import type { WeatherInput, WeatherSnapshot } from "@/lib/api/contracts";
import { isCanonicalLocalDate } from "@/lib/dates/local-date";

export const weatherFields = ["tmin_c", "tmax_c", "humidity_pct", "wind_speed_mps", "shortwave_radiation_sum_mj_m2", "rainfall_mm", "eto_reference_feed"] as const;
export type WeatherField = typeof weatherFields[number];
export type WeatherFormValues = Record<WeatherField, string>;
export type WeatherProvenance = "fetched_reviewed" | "manual";

export interface WeatherDraft {
  targetDate: string;
  provenance: WeatherProvenance;
  values: WeatherFormValues;
  fetchedIdentity?: { stateId: string; targetDate: string; fetchedAt: string };
}

export interface AcceptedWeather {
  stateId: string;
  targetDate: string;
  weather: WeatherInput;
  provenance: WeatherProvenance;
  fetchedIdentity?: WeatherDraft["fetchedIdentity"];
  overrideFlags: Record<WeatherField, boolean>;
  signature: string;
}

export const emptyWeatherValues: WeatherFormValues = Object.fromEntries(weatherFields.map((field) => [field, ""])) as WeatherFormValues;

export const weatherLabels: Record<WeatherField, string> = {
  tmin_c: "Minimum temperature (°C)", tmax_c: "Maximum temperature (°C)", humidity_pct: "Mean humidity (%)", wind_speed_mps: "Wind speed at crop height (m/s)", shortwave_radiation_sum_mj_m2: "Shortwave radiation (MJ/m²), optional", rainfall_mm: "Rainfall (mm)", eto_reference_feed: "Reference ETo (mm), optional",
};

export function valuesFromSnapshot(snapshot: WeatherSnapshot): WeatherFormValues {
  return Object.fromEntries(weatherFields.map((field) => [field, String(snapshot[field])])) as WeatherFormValues;
}

export function parseWeatherValues(values: WeatherFormValues): WeatherInput {
  const parsed = {} as Record<WeatherField, number | null>;
  for (const field of weatherFields) {
    const raw = values[field].trim();
    const optional = field === "shortwave_radiation_sum_mj_m2" || field === "eto_reference_feed";
    if (!raw) {
      if (optional) { parsed[field] = null; continue; }
      throw new Error(`${weatherLabels[field]} is required.`);
    }
    const number = Number(raw);
    if (!Number.isFinite(number)) throw new Error(`${weatherLabels[field]} must be a finite number.`);
    parsed[field] = number;
  }
  if (parsed.humidity_pct! < 0 || parsed.humidity_pct! > 100) throw new Error("Mean humidity must be between 0 and 100.");
  if (parsed.wind_speed_mps! < 0) throw new Error("Wind speed must be non-negative.");
  if (parsed.shortwave_radiation_sum_mj_m2 !== null && parsed.shortwave_radiation_sum_mj_m2! < 0) throw new Error("Shortwave radiation must be non-negative.");
  if (parsed.rainfall_mm! < 0) throw new Error("Rainfall must be non-negative.");
  return parsed as WeatherInput;
}

export function validateWeatherDate(value: string) {
  if (!isCanonicalLocalDate(value)) throw new Error("Choose a real date in YYYY-MM-DD format.");
  return value;
}

export function weatherOverrideFlags(values: WeatherInput, snapshot?: WeatherSnapshot) {
  return Object.fromEntries(weatherFields.map((field) => [field, snapshot ? values[field] !== snapshot[field] : false])) as Record<WeatherField, boolean>;
}

export function acceptedWeatherFromDraft(stateId: string, draft: WeatherDraft, snapshot?: WeatherSnapshot): AcceptedWeather {
  validateWeatherDate(draft.targetDate);
  const weather = parseWeatherValues(draft.values);
  const overrideFlags = weatherOverrideFlags(weather, draft.provenance === "fetched_reviewed" ? snapshot : undefined);
  const signature = JSON.stringify({ stateId, targetDate: draft.targetDate, weather, provenance: draft.provenance, fetchedIdentity: draft.fetchedIdentity, overrideFlags });
  return { stateId, targetDate: draft.targetDate, weather, provenance: draft.provenance, fetchedIdentity: draft.fetchedIdentity, overrideFlags, signature };
}

export function currentWeatherSignature(stateId: string, draft: WeatherDraft, snapshot?: WeatherSnapshot) {
  try { return acceptedWeatherFromDraft(stateId, draft, snapshot).signature; } catch { return undefined; }
}

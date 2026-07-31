import type { WeatherInput, WeatherSnapshotResponse } from "@/lib/types/api";

export const WEATHER_INPUT_FIELDS = [
  "tmin_c",
  "tmax_c",
  "humidity_pct",
  "wind_speed_mps",
  "shortwave_radiation_sum_mj_m2",
  "rainfall_mm",
  "eto_reference_feed",
] as const satisfies readonly (keyof WeatherInput)[];

export const WEATHER_FIELD_LABELS: Record<keyof WeatherInput, string> = {
  tmin_c: "Minimum temperature (C)",
  tmax_c: "Maximum temperature (C)",
  humidity_pct: "Mean humidity (%)",
  wind_speed_mps: "Wind speed at crop height (m/s)",
  shortwave_radiation_sum_mj_m2: "Sunlight energy (MJ/m2)",
  rainfall_mm: "Rainfall (mm)",
  eto_reference_feed: "Reference ETo (mm)",
};

export function weatherInputFromSnapshot(
  snapshot: WeatherSnapshotResponse,
): WeatherInput {
  return {
    tmin_c: snapshot.tmin_c,
    tmax_c: snapshot.tmax_c,
    humidity_pct: snapshot.humidity_pct,
    wind_speed_mps: snapshot.wind_speed_mps,
    shortwave_radiation_sum_mj_m2: snapshot.shortwave_radiation_sum_mj_m2,
    rainfall_mm: snapshot.rainfall_mm,
    eto_reference_feed: snapshot.eto_reference_feed,
  };
}

export function detectWeatherOverrides(
  draft: WeatherInput | null,
  snapshot: WeatherSnapshotResponse | null,
): Record<keyof WeatherInput, boolean> {
  const overrides = Object.fromEntries(
    WEATHER_INPUT_FIELDS.map((field) => [field, false]),
  ) as Record<keyof WeatherInput, boolean>;
  if (!draft || !snapshot) {
    return overrides;
  }
  const fetched = weatherInputFromSnapshot(snapshot);
  for (const field of WEATHER_INPUT_FIELDS) {
    overrides[field] = Math.abs((draft[field] ?? 0) - (fetched[field] ?? 0)) > 1e-9;
  }
  return overrides;
}

export function localIsoDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function initialWeatherDate(plantingDate?: string): string {
  const today = localIsoDate();
  if (!plantingDate || plantingDate > today) {
    return today;
  }
  return today < plantingDate ? plantingDate : today;
}

export function parseWeatherDraft(values: Record<keyof WeatherInput, string>): WeatherInput {
  const parsed = {} as Record<keyof WeatherInput, number>;
  for (const field of WEATHER_INPUT_FIELDS) {
    const raw = values[field].trim();
    if (!raw) {
      throw new Error(`${WEATHER_FIELD_LABELS[field]} is required.`);
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      throw new Error(`${WEATHER_FIELD_LABELS[field]} must be a finite number.`);
    }
    parsed[field] = value;
  }
  if (parsed.humidity_pct < 0 || parsed.humidity_pct > 100) {
    throw new Error("Mean humidity (%) must be between 0 and 100.");
  }
  if (parsed.wind_speed_mps < 0) {
    throw new Error("Wind speed at crop height (m/s) must be >= 0.");
  }
  if (parsed.shortwave_radiation_sum_mj_m2 < 0) {
    throw new Error("Sunlight energy (MJ/m2) must be >= 0.");
  }
  if (parsed.rainfall_mm < 0) {
    throw new Error("Rainfall (mm) must be >= 0.");
  }
  return {
    tmin_c: parsed.tmin_c,
    tmax_c: parsed.tmax_c,
    humidity_pct: parsed.humidity_pct,
    wind_speed_mps: parsed.wind_speed_mps,
    shortwave_radiation_sum_mj_m2: parsed.shortwave_radiation_sum_mj_m2,
    rainfall_mm: parsed.rainfall_mm,
    eto_reference_feed: parsed.eto_reference_feed,
  };
}

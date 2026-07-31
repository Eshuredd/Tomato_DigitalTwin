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

export const REQUIRED_WEATHER_INPUT_FIELDS = [
  "tmin_c",
  "tmax_c",
  "humidity_pct",
  "wind_speed_mps",
  "rainfall_mm",
] as const satisfies readonly (keyof WeatherInput)[];

export const OPTIONAL_WEATHER_INPUT_FIELDS = [
  "shortwave_radiation_sum_mj_m2",
  "eto_reference_feed",
] as const satisfies readonly (keyof WeatherInput)[];

export function isOptionalWeatherInputField(
  field: keyof WeatherInput,
): field is (typeof OPTIONAL_WEATHER_INPUT_FIELDS)[number] {
  return (OPTIONAL_WEATHER_INPUT_FIELDS as readonly (keyof WeatherInput)[]).includes(field);
}

export const WEATHER_FIELD_LABELS: Record<keyof WeatherInput, string> = {
  tmin_c: "Minimum temperature (C)",
  tmax_c: "Maximum temperature (C)",
  humidity_pct: "Mean humidity (%)",
  wind_speed_mps: "Wind speed at crop height (m/s)",
  shortwave_radiation_sum_mj_m2: "Sunlight energy (MJ/m2, optional)",
  rainfall_mm: "Rainfall (mm)",
  eto_reference_feed: "Reference ETo (mm, optional)",
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

export function initialWeatherDate(
  plantingDate?: string | null,
  today = localIsoDate(),
): string {
  if (!isCanonicalIsoDate(today)) {
    throw new Error("today must be a canonical YYYY-MM-DD date.");
  }
  if (!plantingDate || !isCanonicalIsoDate(plantingDate)) {
    return today;
  }
  return compareCanonicalIsoDates(today, plantingDate) >= 0 ? today : plantingDate;
}

export function parseWeatherDraft(values: Record<keyof WeatherInput, string>): WeatherInput {
  const required = {} as Record<(typeof REQUIRED_WEATHER_INPUT_FIELDS)[number], number>;
  const optional = {} as Record<(typeof OPTIONAL_WEATHER_INPUT_FIELDS)[number], number | null>;
  for (const field of REQUIRED_WEATHER_INPUT_FIELDS) {
    const raw = values[field].trim();
    if (!raw) {
      throw new Error(`${WEATHER_FIELD_LABELS[field]} is required.`);
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      throw new Error(`${WEATHER_FIELD_LABELS[field]} must be a finite number.`);
    }
    required[field] = value;
  }
  for (const field of OPTIONAL_WEATHER_INPUT_FIELDS) {
    const raw = values[field].trim();
    if (!raw) {
      optional[field] = null;
      continue;
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      throw new Error(`${WEATHER_FIELD_LABELS[field]} must be a finite number.`);
    }
    optional[field] = value;
  }
  if (required.humidity_pct < 0 || required.humidity_pct > 100) {
    throw new Error("Mean humidity (%) must be between 0 and 100.");
  }
  if (required.wind_speed_mps < 0) {
    throw new Error("Wind speed at crop height (m/s) must be >= 0.");
  }
  if (
    optional.shortwave_radiation_sum_mj_m2 !== null &&
    optional.shortwave_radiation_sum_mj_m2 < 0
  ) {
    throw new Error("Sunlight energy (MJ/m2) must be >= 0.");
  }
  if (required.rainfall_mm < 0) {
    throw new Error("Rainfall (mm) must be >= 0.");
  }
  return {
    tmin_c: required.tmin_c,
    tmax_c: required.tmax_c,
    humidity_pct: required.humidity_pct,
    wind_speed_mps: required.wind_speed_mps,
    shortwave_radiation_sum_mj_m2: optional.shortwave_radiation_sum_mj_m2,
    rainfall_mm: required.rainfall_mm,
    eto_reference_feed: optional.eto_reference_feed,
  };
}

function isCanonicalIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function compareCanonicalIsoDates(left: string, right: string): number {
  const leftDate = new Date(`${left}T00:00:00`);
  const rightDate = new Date(`${right}T00:00:00`);
  return leftDate.valueOf() - rightDate.valueOf();
}

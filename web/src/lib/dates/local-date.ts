export function localDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function isCanonicalLocalDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function initialWeatherDate(plantingDate?: string, today = localDateInputValue()) {
  if (!isCanonicalLocalDate(today)) throw new Error("Today must be a canonical YYYY-MM-DD date.");
  return plantingDate && isCanonicalLocalDate(plantingDate) && plantingDate > today ? plantingDate : today;
}

export function localDateTimeInputValue(date = new Date()) {
  return `${localDateInputValue(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function awareIsoFromLocalDateTime(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("Event date and time are required.");
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) throw new Error("Event date and time are invalid.");
  const roundTrip = localDateTimeInputValue(parsed);
  if (roundTrip !== value) throw new Error("Event date and time are invalid.");
  return parsed.toISOString();
}

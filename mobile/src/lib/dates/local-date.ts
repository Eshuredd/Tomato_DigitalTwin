export function localCalendarDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
export function localDateTimeInput(date = new Date()): string { return `${localCalendarDate(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`; }
export function localDateTimeForDate(date: string): string { return `${date}T12:00`; }
export function awareIsoFromLocalDateTime(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Event date and time are required.');
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.valueOf()) || localDateTimeInput(parsed) !== value) throw new Error('Event date and time are invalid.');
  return parsed.toISOString();
}
export function nextUtcCalendarDate(timestamp: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T/.exec(timestamp);
  if (!match || !/(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp) || Number.isNaN(Date.parse(timestamp))) throw new Error('Canonical observation timestamp is invalid.');
  const instant = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1));
  return instant.toISOString().slice(0, 10);
}

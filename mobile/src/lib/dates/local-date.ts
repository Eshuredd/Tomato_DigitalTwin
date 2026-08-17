export function localCalendarDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
export function localDateTimeInput(date = new Date()): string { return `${localCalendarDate(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`; }
export function awareIsoFromLocalDateTime(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Event date and time are required.');
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.valueOf()) || localDateTimeInput(parsed) !== value) throw new Error('Event date and time are invalid.');
  return parsed.toISOString();
}

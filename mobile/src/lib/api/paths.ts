export function encodePathSegment(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('API path segments must not be empty.');
  return encodeURIComponent(trimmed);
}
export function sessionPath(stateId: string, suffix = '') { const base = `/sessions/${encodePathSegment(stateId)}`; return suffix ? `${base}/${suffix.replace(/^\/+/, '')}` : base; }
export function farmPath(farmId: string, suffix = '') { const base = `/farms/${encodePathSegment(farmId)}`; return suffix ? `${base}/${suffix.replace(/^\/+/, '')}` : base; }
export function plotPath(plotId: string, suffix = '') { const base = `/plots/${encodePathSegment(plotId)}`; return suffix ? `${base}/${suffix.replace(/^\/+/, '')}` : base; }
export function queryString(values: Record<string, string | number | boolean | null | undefined>): string {
  const parts = Object.entries(values).filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined && entry[1] !== null).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

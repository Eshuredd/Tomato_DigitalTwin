export function encodePathSegment(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("API path segments must not be empty.");
  return encodeURIComponent(trimmed);
}

export function sessionPath(stateId: string, suffix = ""): string {
  const base = `/sessions/${encodePathSegment(stateId)}`;
  return suffix ? `${base}/${suffix.replace(/^\/+/, "")}` : base;
}

export function farmPath(farmId: string, suffix = ""): string {
  const base = `/farms/${encodePathSegment(farmId)}`;
  return suffix ? `${base}/${suffix.replace(/^\/+/, "")}` : base;
}

export function plotPath(plotId: string, suffix = ""): string {
  const base = `/plots/${encodePathSegment(plotId)}`;
  return suffix ? `${base}/${suffix.replace(/^\/+/, "")}` : base;
}

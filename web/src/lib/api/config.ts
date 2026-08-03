const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000";

export function resolveApiBaseUrl(value = process.env.NEXT_PUBLIC_API_BASE_URL): string {
  const candidate = value?.trim() || DEFAULT_API_BASE_URL;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must be a valid absolute HTTP or HTTPS URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must use HTTP or HTTPS.");
  }
  return parsed.toString().replace(/\/$/, "");
}

export const API_BASE_URL = resolveApiBaseUrl();
export const DEFAULT_API_TIMEOUT_MS = 30_000;

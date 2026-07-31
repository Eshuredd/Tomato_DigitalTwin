const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000";

export function normalizeApiBaseUrl(value: string | undefined): string {
  if (value === undefined) {
    return DEFAULT_API_BASE_URL;
  }
  const raw = value.trim();
  if (!raw) {
    throw new Error("NEXT_PUBLIC_CROPTWIN_API_BASE_URL must not be empty.");
  }
  const normalized = raw.replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(
      "NEXT_PUBLIC_CROPTWIN_API_BASE_URL must be a valid HTTP or HTTPS URL.",
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      "NEXT_PUBLIC_CROPTWIN_API_BASE_URL must be a valid HTTP or HTTPS URL.",
    );
  }
  return normalized;
}

export function getPublicEnv() {
  return {
    apiBaseUrl: normalizeApiBaseUrl(
      process.env.NEXT_PUBLIC_CROPTWIN_API_BASE_URL,
    ),
  };
}

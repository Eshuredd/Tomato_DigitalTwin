const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000";

export function normalizeApiBaseUrl(value: string | undefined): string {
  const raw = value?.trim() || DEFAULT_API_BASE_URL;
  const normalized = raw.replace(/\/+$/, "");
  if (!normalized) {
    throw new Error("NEXT_PUBLIC_CROPTWIN_API_BASE_URL must not be empty.");
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

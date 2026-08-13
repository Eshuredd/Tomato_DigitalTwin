const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000';

export function resolveApiBaseUrl(value?: string): string {
  const candidate = value?.trim() || DEFAULT_API_BASE_URL;
  let parsed: URL;
  try { parsed = new URL(candidate); } catch { throw new Error('EXPO_PUBLIC_API_BASE_URL must be a valid absolute HTTP or HTTPS URL.'); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('EXPO_PUBLIC_API_BASE_URL must use HTTP or HTTPS.');
  if (parsed.username || parsed.password) throw new Error('EXPO_PUBLIC_API_BASE_URL must not include credentials.');
  if (parsed.search || parsed.hash) throw new Error('EXPO_PUBLIC_API_BASE_URL must not include a query string or fragment.');
  return parsed.toString().replace(/\/$/, '');
}

export const API_BASE_URL = resolveApiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL);
export const DEFAULT_API_TIMEOUT_MS = 15_000;

import type { z } from 'zod';
import { API_BASE_URL, DEFAULT_API_TIMEOUT_MS } from './config';
import { CropTwinApiError, parseBackendError } from './errors';

export interface ApiRequestOptions<T> extends Omit<RequestInit, 'body'> { body?: unknown; timeoutMs?: number; schema?: z.ZodType<T>; baseUrl?: string; allowEmpty?: boolean; }

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return undefined;
  try { return JSON.parse(text) as unknown; } catch (cause) { throw new CropTwinApiError({ kind: 'malformed', code: 'MALFORMED_JSON', message: 'FastAPI returned invalid JSON.', statusCode: response.status, cause }); }
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions<T> = {}): Promise<T> {
  const { body, timeoutMs = DEFAULT_API_TIMEOUT_MS, schema, signal, baseUrl = API_BASE_URL, headers, allowEmpty = false, ...requestInit } = options;
  const controller = new AbortController(); let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener('abort', abortFromCaller, { once: true });
  try {
    if (signal?.aborted) controller.abort();
    const response = await fetch(`${baseUrl}${path}`, { ...requestInit, signal: controller.signal, headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const payload = await parseJson(response);
    if (!response.ok) {
      const backend = parseBackendError(payload, response.status); if (backend) throw backend;
      if (response.status === 422 && payload && typeof payload === 'object' && 'detail' in payload) throw new CropTwinApiError({ kind: 'backend', code: 'FASTAPI_VALIDATION_ERROR', message: 'Request validation failed.', statusCode: response.status, details: { response: payload } });
      throw new CropTwinApiError({ kind: 'http', code: 'HTTP_ERROR', message: `FastAPI returned HTTP ${response.status}.`, statusCode: response.status, details: payload && typeof payload === 'object' ? { response: payload } : {} });
    }
    if (payload === undefined) {
      if (allowEmpty) return undefined as T;
      throw new CropTwinApiError({ kind: 'malformed', code: 'EMPTY_RESPONSE', message: 'FastAPI returned an empty response.', statusCode: response.status });
    }
    if (!schema) return payload as T;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) throw new CropTwinApiError({ kind: 'malformed', code: 'MALFORMED_RESPONSE', message: 'FastAPI response did not match the runtime contract.', statusCode: response.status, details: { issues: parsed.error.issues } });
    return parsed.data;
  } catch (cause) {
    if (cause instanceof CropTwinApiError) throw cause;
    if (controller.signal.aborted) {
      if (timedOut) throw new CropTwinApiError({ kind: 'timeout', code: 'REQUEST_TIMEOUT', message: 'FastAPI request timed out.', details: { timeoutMs }, cause });
      throw new CropTwinApiError({ kind: 'cancelled', code: 'REQUEST_CANCELLED', message: 'FastAPI request was cancelled.', cause });
    }
    throw new CropTwinApiError({ kind: 'network', code: 'NETWORK_ERROR', message: 'Could not connect to FastAPI.', cause });
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abortFromCaller); }
}

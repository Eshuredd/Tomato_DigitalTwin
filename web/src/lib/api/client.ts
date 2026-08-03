import type { z } from "zod";
import { API_BASE_URL, DEFAULT_API_TIMEOUT_MS } from "./config";
import { CropTwinApiError, parseBackendError } from "./errors";

export interface ApiRequestOptions<T> extends Omit<RequestInit, "body"> {
  body?: unknown;
  timeoutMs?: number;
  schema?: z.ZodType<T>;
  baseUrl?: string;
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch (cause) {
    throw new CropTwinApiError({ kind: "malformed", code: "MALFORMED_RESPONSE", message: "The CropTwin API returned a response that was not valid JSON.", statusCode: response.status, cause });
  }
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions<T> = {}): Promise<T> {
  const { body, timeoutMs = DEFAULT_API_TIMEOUT_MS, schema, signal, baseUrl = API_BASE_URL, headers, ...requestInit } = options;
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener("abort", abortFromCaller, { once: true });

  try {
    if (signal?.aborted) controller.abort();
    const response = await fetch(`${baseUrl}${path}`, {
      ...requestInit,
      signal: controller.signal,
      headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await parseJson(response);
    if (!response.ok) {
      const backendError = parseBackendError(payload, response.status);
      if (backendError) throw backendError;
      if (response.status === 422 && payload && typeof payload === "object" && "detail" in payload) {
        throw new CropTwinApiError({ kind: "backend", code: "FASTAPI_VALIDATION_ERROR", message: "Request validation failed.", statusCode: response.status, details: payload as Record<string, unknown> });
      }
      throw new CropTwinApiError({ kind: "http", code: "HTTP_ERROR", message: `CropTwin API returned HTTP ${response.status}.`, statusCode: response.status, details: payload && typeof payload === "object" ? { response: payload } : {} });
    }
    if (payload === undefined) {
      throw new CropTwinApiError({ kind: "malformed", code: "EMPTY_RESPONSE", message: "The CropTwin API returned an empty response.", statusCode: response.status });
    }
    if (schema) {
      const parsed = schema.safeParse(payload);
      if (!parsed.success) throw new CropTwinApiError({ kind: "malformed", code: "MALFORMED_RESPONSE", message: "The CropTwin API response did not match the generated contract.", statusCode: response.status, details: { issues: parsed.error.issues } });
      return parsed.data;
    }
    return payload as T;
  } catch (cause) {
    if (cause instanceof CropTwinApiError) throw cause;
    if (controller.signal.aborted) {
      if (timedOut) throw new CropTwinApiError({ kind: "timeout", code: "REQUEST_TIMEOUT", message: "The CropTwin API request timed out.", details: { timeoutMs }, cause });
      throw new CropTwinApiError({ kind: "cancelled", code: "REQUEST_CANCELLED", message: "The CropTwin API request was cancelled.", cause });
    }
    throw new CropTwinApiError({ kind: "network", code: "NETWORK_ERROR", message: "Could not connect to the CropTwin API.", cause });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

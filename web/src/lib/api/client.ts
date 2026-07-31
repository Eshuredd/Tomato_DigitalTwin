import {
  CropTwinApiError,
  errorFromStructuredEnvelope,
  isCropTwinErrorEnvelope,
  redactSensitive,
} from "./errors";
import { normalizeApiBaseUrl } from "@/lib/config/env";

const DEFAULT_TIMEOUT_MS = 30_000;

export interface ApiRequestOptions<TBody = undefined> {
  method?: "GET" | "POST";
  body?: TBody;
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: HeadersInit;
}

export class CropTwinApiClient {
  readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly defaultTimeoutMs: number;

  constructor({
    baseUrl,
    fetcher = fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  }: {
    baseUrl: string;
    fetcher?: typeof fetch;
    timeoutMs?: number;
  }) {
    this.baseUrl = normalizeApiBaseUrl(baseUrl);
    this.fetcher = fetcher;
    this.defaultTimeoutMs = timeoutMs;
  }

  async request<TResponse, TBody = undefined>(
    path: string,
    options: ApiRequestOptions<TBody> = {},
  ): Promise<TResponse> {
    const method = options.method ?? "GET";
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort("timeout"), timeoutMs);
    const abortListener = () => controller.abort("caller");

    if (options.signal) {
      if (options.signal.aborted) {
        clearTimeout(timeoutId);
        throw abortError();
      }
      options.signal.addEventListener("abort", abortListener, { once: true });
    }

    try {
      const response = await this.fetcher(`${this.baseUrl}${path}`, {
        method,
        headers: buildHeaders(options.headers, options.body),
        body:
          options.body === undefined
            ? undefined
            : JSON.stringify(options.body),
        signal: controller.signal,
      });
      return await parseResponse<TResponse>(response);
    } catch (error) {
      if (error instanceof CropTwinApiError) {
        throw error;
      }
      if (controller.signal.aborted) {
        if (controller.signal.reason === "timeout") {
          throw new CropTwinApiError({
            kind: "timeout",
            status: null,
            code: "FRONTEND_REQUEST_TIMEOUT",
            message: "The CropTwin API request timed out.",
          });
        }
        throw abortError();
      }
      throw new CropTwinApiError({
        kind: "network",
        status: null,
        code: "FRONTEND_NETWORK_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Could not connect to the CropTwin API.",
      });
    } finally {
      clearTimeout(timeoutId);
      options.signal?.removeEventListener("abort", abortListener);
    }
  }
}

function buildHeaders(headers: HeadersInit | undefined, body: unknown): HeadersInit {
  if (body === undefined) {
    return headers ?? {};
  }
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...headers,
  };
}

async function parseResponse<TResponse>(response: Response): Promise<TResponse> {
  if (response.status === 204) {
    return undefined as TResponse;
  }

  const text = await response.text();
  if (!text.trim()) {
    if (response.ok) {
      return undefined as TResponse;
    }
    throw new CropTwinApiError({
      kind: "empty",
      status: response.status,
      code: "FRONTEND_EMPTY_ERROR_RESPONSE",
      message: "The CropTwin API returned an empty error response.",
      response,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new CropTwinApiError({
      kind: "non_json",
      status: response.status,
      code: "FRONTEND_NON_JSON_RESPONSE",
      message: "The CropTwin API returned a non-JSON response.",
      response,
    });
  }

  if (!response.ok) {
    if (isCropTwinErrorEnvelope(parsed)) {
      throw errorFromStructuredEnvelope(parsed, response);
    }
    if (isFastApiValidationError(parsed)) {
      throw new CropTwinApiError({
        kind: "api",
        status: response.status,
        code: "FASTAPI_VALIDATION_ERROR",
        message: "Request validation failed.",
        details: { errors: redactSensitive(parsed.detail) },
        response,
      });
    }
    throw new CropTwinApiError({
      kind: "malformed",
      status: response.status,
      code: "FRONTEND_MALFORMED_ERROR_RESPONSE",
      message: "The CropTwin API returned an unexpected error response.",
      response,
    });
  }

  return parsed as TResponse;
}

function isFastApiValidationError(value: unknown): value is { detail: unknown[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { detail?: unknown }).detail)
  );
}

function abortError(): CropTwinApiError {
  return new CropTwinApiError({
    kind: "abort",
    status: null,
    code: "FRONTEND_REQUEST_ABORTED",
    message: "The CropTwin API request was cancelled.",
  });
}

export function encodePath(value: string): string {
  return encodeURIComponent(value);
}

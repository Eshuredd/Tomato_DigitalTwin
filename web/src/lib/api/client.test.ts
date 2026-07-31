import { describe, expect, it, vi } from "vitest";
import { CropTwinApiClient } from "./client";
import { CropTwinApiError } from "./errors";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("CropTwinApiClient", () => {
  it("normalizes trailing slashes from the base URL", () => {
    const client = new CropTwinApiClient({ baseUrl: "http://testserver///" });

    expect(client.baseUrl).toBe("http://testserver");
  });

  it("uses the correct GET health path", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ status: "ok" }));
    const client = new CropTwinApiClient({ baseUrl: "http://api", fetcher });

    await client.request("/health");

    expect(fetcher).toHaveBeenCalledWith(
      "http://api/health",
      expect.objectContaining({ cache: "no-store", method: "GET" }),
    );
  });

  it("posts a session body with JSON headers", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ state_id: "state-1" }));
    const client = new CropTwinApiClient({ baseUrl: "http://api", fetcher });
    const body = { crop_type: "tomato" };

    await client.request("/sessions", { method: "POST", body });

    expect(fetcher).toHaveBeenCalledWith(
      "http://api/sessions",
      expect.objectContaining({
        body: JSON.stringify(body),
        cache: "no-store",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
        method: "POST",
      }),
    );
  });

  it("parses structured 422 errors", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        { error: { code: "INVALID_LOCATION", message: "Invalid.", details: { reason: "bad" } } },
        { status: 422 },
      ),
    );
    const client = new CropTwinApiClient({ baseUrl: "http://api", fetcher });

    await expect(client.request("/sessions")).rejects.toMatchObject({
      code: "INVALID_LOCATION",
      status: 422,
      details: { reason: "bad" },
    });
  });

  it("parses structured 404 errors", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        { error: { code: "STATE_NOT_FOUND", message: "Missing.", details: {} } },
        { status: 404 },
      ),
    );
    const client = new CropTwinApiClient({ baseUrl: "http://api", fetcher });

    await expect(client.request("/sessions/missing")).rejects.toMatchObject({
      code: "STATE_NOT_FOUND",
      status: 404,
    });
  });

  it("handles non-JSON error responses", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("oops", { status: 500 }));
    const client = new CropTwinApiClient({ baseUrl: "http://api", fetcher });

    await expect(client.request("/health")).rejects.toMatchObject({
      code: "FRONTEND_NON_JSON_RESPONSE",
      kind: "non_json",
    });
  });

  it("handles empty error responses", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 500 }));
    const client = new CropTwinApiClient({ baseUrl: "http://api", fetcher });

    await expect(client.request("/health")).rejects.toMatchObject({
      code: "FRONTEND_EMPTY_ERROR_RESPONSE",
      kind: "empty",
    });
  });

  it("maps network failures", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline"));
    const client = new CropTwinApiClient({ baseUrl: "http://api", fetcher });

    await expect(client.request("/health")).rejects.toMatchObject({
      code: "FRONTEND_NETWORK_ERROR",
      kind: "network",
    });
  });

  it("maps request timeouts", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn<typeof fetch>().mockImplementation(
        (_input, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          }),
      );
      const client = new CropTwinApiClient({ baseUrl: "http://api", fetcher, timeoutMs: 10 });
      const request = client.request("/health");
      const assertion = expect(request).rejects.toMatchObject({
        code: "FRONTEND_REQUEST_TIMEOUT",
        kind: "timeout",
      });

      await vi.advanceTimersByTimeAsync(11);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("maps caller aborts", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const client = new CropTwinApiClient({ baseUrl: "http://api", fetcher });
    const request = client.request("/health", { signal: controller.signal });

    controller.abort();

    await expect(request).rejects.toMatchObject({
      code: "FRONTEND_REQUEST_ABORTED",
      kind: "abort",
    });
  });

  it("redacts image_base64 from displayed errors", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "DISEASE_MODEL_UNAVAILABLE",
            message: "No model.",
            details: { image_base64: "secret", nested: { image_base64: "also-secret" } },
          },
        },
        { status: 503 },
      ),
    );
    const client = new CropTwinApiClient({ baseUrl: "http://api", fetcher });

    await expect(client.request("/disease")).rejects.toMatchObject({
      details: { image_base64: "[redacted]", nested: { image_base64: "[redacted]" } },
    });
  });

  it("does not retry failed POST requests", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline"));
    const client = new CropTwinApiClient({ baseUrl: "http://api", fetcher });

    await expect(client.request("/sessions", { method: "POST", body: { crop_type: "tomato" } })).rejects.toBeInstanceOf(CropTwinApiError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not send JSON content type for body-less GET requests", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ status: "ok" }));
    const client = new CropTwinApiClient({ baseUrl: "http://api", fetcher });

    await client.request("/health");

    expect(fetcher).toHaveBeenCalledWith(
      "http://api/health",
      expect.objectContaining({ headers: {} }),
    );
  });

  it("supports successful empty responses", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const client = new CropTwinApiClient({ baseUrl: "http://api", fetcher });

    await expect(client.request<void>("/empty")).resolves.toBeUndefined();
  });
});

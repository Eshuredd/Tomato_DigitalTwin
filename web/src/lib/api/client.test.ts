import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "./client";
import { CropTwinApiError } from "./errors";

afterEach(() => vi.unstubAllGlobals());

function abortableFetch() {
  return vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  }));
}

describe("apiRequest", () => {
  it("maps backend errors and performs no automatic POST retry", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { status_code: 409, code: "WATER_UPDATE_CONFLICT", message: "Conflict.", details: { water_update_id: "one" } } }), { status: 409, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(apiRequest("/sessions/one/compute-water-state", { method: "POST", body: { state_id: "one" } })).rejects.toMatchObject({ code: "WATER_UPDATE_CONFLICT", kind: "backend" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports a malformed successful response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not json", { status: 200 })));
    await expect(apiRequest("/health")).rejects.toMatchObject({ code: "MALFORMED_RESPONSE", kind: "malformed" });
  });

  it("times out through AbortSignal", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", abortableFetch());
    const request = apiRequest("/health", { timeoutMs: 20 });
    const assertion = expect(request).rejects.toMatchObject({ code: "REQUEST_TIMEOUT", kind: "timeout" });
    await vi.advanceTimersByTimeAsync(20);
    await assertion;
    vi.useRealTimers();
  });

  it("distinguishes caller cancellation from timeout", async () => {
    vi.stubGlobal("fetch", abortableFetch());
    const controller = new AbortController();
    const request = apiRequest("/health", { signal: controller.signal, timeoutMs: 10_000 });
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: "CropTwinApiError", code: "REQUEST_CANCELLED", kind: "cancelled" } satisfies Partial<CropTwinApiError>);
  });
});

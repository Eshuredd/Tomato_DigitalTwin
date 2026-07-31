import { describe, expect, it, vi } from "vitest";
import { CropTwinApiClient } from "./client";
import { CropTwinEndpoints } from "./endpoints";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("CropTwinEndpoints", () => {
  it("URL encodes state IDs in endpoint paths", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ state_id: "state 1/2", history: [] }));
    const endpoints = new CropTwinEndpoints(new CropTwinApiClient({ baseUrl: "http://api", fetcher }));

    await endpoints.getSessionHistory("state 1/2");

    expect(fetcher).toHaveBeenCalledWith(
      "http://api/sessions/state%201%2F2/history",
      expect.objectContaining({ method: "GET" }),
    );
  });
});

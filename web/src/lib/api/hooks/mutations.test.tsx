import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "../query-keys";
import { useCreateFarm } from "./use-farms";
import { useCreatePlot } from "./use-plots";

vi.mock("../operations", () => ({
  createFarm: vi.fn().mockResolvedValue({ farm_id: "farm-1", name: "A", created_at: "now", updated_at: "now" }),
  createPlot: vi.fn().mockResolvedValue({ plot_id: "plot-1", farm_id: "farm-1", name: "P", location: { name: "F", latitude: 1, longitude: 2 }, soil_texture: "loam", created_at: "now", updated_at: "now" }),
  getFarm: vi.fn(), getFarms: vi.fn(), getPlot: vi.fn(), getPlots: vi.fn(),
}));

describe("mutation cache scope", () => {
  let client: QueryClient;
  beforeEach(() => { client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); });
  function wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={client}>{children}</QueryClientProvider>; }

  it("invalidates the farm list and seeds the created farm", async () => {
    client.setQueryData(queryKeys.farms(), []);
    const { result } = renderHook(() => useCreateFarm(), { wrapper });
    act(() => result.current.mutate({ name: "A" })); await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(queryKeys.farm("farm-1"))).toMatchObject({ name: "A" });
    expect(client.getQueryState(queryKeys.farms())?.isInvalidated).toBe(true);
  });

  it("invalidates only the selected farm plot list", async () => {
    client.setQueryData(queryKeys.plots("farm-1"), []); client.setQueryData(queryKeys.plots("farm-2"), []);
    const { result } = renderHook(() => useCreatePlot("farm-1"), { wrapper });
    act(() => result.current.mutate({ name: "P", location: { name: "F", latitude: 1, longitude: 2 }, soil_texture: "loam" })); await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryState(queryKeys.plots("farm-1"))?.isInvalidated).toBe(true);
    expect(client.getQueryState(queryKeys.plots("farm-2"))?.isInvalidated).toBe(false);
    expect(client.getQueryData(queryKeys.plot("plot-1"))).toMatchObject({ farm_id: "farm-1" });
  });
});

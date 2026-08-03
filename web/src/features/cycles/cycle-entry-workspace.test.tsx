import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CropTwinApiError } from "@/lib/api/errors";
import { CycleEntryWorkspace } from "./cycle-entry-workspace";

const push = vi.fn();
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/api/operations", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api/operations")>()), getSession }));
vi.mock("@/lib/api/hooks/use-sessions", () => ({ useCreateSession: () => ({ mutate: vi.fn(), isPending: false, isError: false }) }));

function renderWorkspace() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><CycleEntryWorkspace /></QueryClientProvider>);
}

describe("existing session loading", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("trims, fetches, caches, and navigates only after success", async () => {
    getSession.mockResolvedValue({ state_id: "state/one", crop_type: "tomato", planting_date: "2026-08-01", location: { name: "F", latitude: 1, longitude: 2 }, soil_texture: "loam", current_state: {} });
    renderWorkspace(); fireEvent.click(screen.getByRole("tab", { name: "Load existing" })); fireEvent.change(screen.getByLabelText("State ID"), { target: { value: "  state/one  " } }); fireEvent.click(screen.getByRole("button", { name: "Load session" }));
    await waitFor(() => expect(getSession).toHaveBeenCalledWith("state/one", expect.any(AbortSignal)));
    expect(push).toHaveBeenCalledWith("/cycle/state%2Fone");
  });
  it("keeps the route unchanged and shows a structured not-found error", async () => {
    getSession.mockRejectedValue(new CropTwinApiError({ kind: "backend", code: "STATE_NOT_FOUND", message: "Session missing.", statusCode: 404 }));
    renderWorkspace(); fireEvent.click(screen.getByRole("tab", { name: "Load existing" })); fireEvent.change(screen.getByLabelText("State ID"), { target: { value: "missing" } }); fireEvent.click(screen.getByRole("button", { name: "Load session" }));
    expect(await screen.findByText(/requested farm, plot, or session was not found/i)).toBeVisible();
    expect(push).not.toHaveBeenCalled();
  });
});

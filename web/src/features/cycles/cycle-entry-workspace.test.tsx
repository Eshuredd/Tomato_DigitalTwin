import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CropTwinApiError } from "@/lib/api/errors";
import { CycleEntryWorkspace } from "./cycle-entry-workspace";

const push = vi.fn();
const { createMutate, getSession } = vi.hoisted(() => ({
  createMutate: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/api/operations", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api/operations")>()), getSession }));
vi.mock("@/lib/api/hooks/use-sessions", () => ({ useCreateSession: () => ({ mutate: createMutate, isPending: false, isError: false }) }));
vi.mock("@/lib/dates/local-date", () => ({
  localDateInputValue: () => "2042-03-04",
}));

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

describe("standalone session creation", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("uses the shared local calendar date helper", () => {
    renderWorkspace();
    expect(screen.getByLabelText("Planting date")).toHaveValue("2042-03-04");
  });

  it("shows field errors and does not mutate when coordinates are blank", async () => {
    renderWorkspace();
    fireEvent.change(screen.getByLabelText("Location name"), {
      target: { value: "Blank coordinate field" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create standalone session" }));

    expect(await screen.findByText("Latitude is required.")).toBeVisible();
    expect(screen.getByText("Longitude is required.")).toBeVisible();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("submits explicit coordinate and elevation zero without coercion or omission", async () => {
    renderWorkspace();
    fireEvent.change(screen.getByLabelText("Location name"), {
      target: { value: "Zero field" },
    });
    fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Longitude"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Elevation (m), optional"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create standalone session" }));

    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(createMutate.mock.calls[0][0]).toEqual({
      crop_type: "tomato",
      planting_date: "2042-03-04",
      location: {
        name: "Zero field",
        latitude: 0,
        longitude: 0,
        elevation_m: 0,
      },
      soil_texture: "sandy_loam",
    });
  });

  it("omits a blank elevation from the mutation payload", async () => {
    renderWorkspace();
    fireEvent.change(screen.getByLabelText("Location name"), {
      target: { value: "No elevation field" },
    });
    fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Longitude"), { target: { value: "-34" } });
    fireEvent.click(screen.getByRole("button", { name: "Create standalone session" }));

    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(createMutate.mock.calls[0][0].location).toEqual({
      name: "No elevation field",
      latitude: 12,
      longitude: -34,
    });
  });
});

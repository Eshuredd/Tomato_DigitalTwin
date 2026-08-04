import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FarmDetailWorkspace } from "./farm-detail-workspace";

const { createMutate } = vi.hoisted(() => ({ createMutate: vi.fn() }));
vi.mock("@/lib/api/hooks/use-farms", () => ({
  useFarm: () => ({
    isLoading: false,
    isError: false,
    data: { farm_id: "farm-1", name: "Test Farm" },
  }),
}));
vi.mock("@/lib/api/hooks/use-plots", () => ({
  usePlots: () => ({ isLoading: false, isError: false, data: [] }),
  useCreatePlot: () => ({
    mutate: createMutate,
    isPending: false,
    isError: false,
  }),
}));

describe("plot creation coordinate boundaries", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  function fillNames() {
    fireEvent.change(screen.getByLabelText("Plot name"), {
      target: { value: "Test Plot" },
    });
    fireEvent.change(screen.getByLabelText("Location name"), {
      target: { value: "Test Field" },
    });
  }

  it("shows field errors and does not mutate when coordinates are blank", async () => {
    render(<FarmDetailWorkspace farmId="farm-1" />);
    fillNames();
    fireEvent.click(screen.getByRole("button", { name: "Create plot" }));

    expect(await screen.findByText("Latitude is required.")).toBeVisible();
    expect(screen.getByText("Longitude is required.")).toBeVisible();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("retains explicit zeros in the plot mutation payload", async () => {
    render(<FarmDetailWorkspace farmId="farm-1" />);
    fillNames();
    fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Longitude"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Elevation (m), optional"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create plot" }));

    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(createMutate.mock.calls[0][0]).toEqual({
      name: "Test Plot",
      location: {
        name: "Test Field",
        latitude: 0,
        longitude: 0,
        elevation_m: 0,
      },
      soil_texture: "sandy_loam",
    });
  });

  it("omits blank elevation from the plot mutation payload", async () => {
    render(<FarmDetailWorkspace farmId="farm-1" />);
    fillNames();
    fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Longitude"), { target: { value: "-34" } });
    fireEvent.click(screen.getByRole("button", { name: "Create plot" }));

    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(createMutate.mock.calls[0][0].location).toEqual({
      name: "Test Field",
      latitude: 12,
      longitude: -34,
    });
  });
});

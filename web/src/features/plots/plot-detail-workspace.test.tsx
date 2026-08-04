import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlotDetailWorkspace } from "./plot-detail-workspace";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/dates/local-date", () => ({
  localDateInputValue: () => "2042-03-04",
}));
vi.mock("@/lib/api/hooks/use-farms", () => ({
  useFarm: () => ({ data: { farm_id: "farm-1", name: "Test Farm" } }),
}));
vi.mock("@/lib/api/hooks/use-plots", () => ({
  usePlot: () => ({
    isLoading: false,
    isError: false,
    data: {
      plot_id: "plot-1",
      farm_id: "farm-1",
      name: "North Plot",
      location: { name: "North Field", latitude: 17, longitude: 78 },
      soil_texture: "loam",
    },
  }),
}));
vi.mock("@/lib/api/hooks/use-sessions", () => ({
  useCreateCropCycle: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
  }),
}));

describe("PlotDetailWorkspace", () => {
  it("uses the shared local calendar date helper for cycle creation", () => {
    render(<PlotDetailWorkspace plotId="plot-1" />);
    expect(screen.getByLabelText("Planting date")).toHaveValue("2042-03-04");
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CropTwinApiError } from "@/lib/api/errors";
import { FarmsWorkspace } from "./farms-workspace";

const push = vi.fn();
let farmsState: Record<string, unknown>;
let createState: Record<string, unknown>;
const mutate = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/api/hooks/use-farms", () => ({ useFarms: () => farmsState, useCreateFarm: () => createState }));

describe("FarmsWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    farmsState = { isLoading: false, isError: false, isFetching: false, data: [], refetch: vi.fn() };
    createState = { isPending: false, isError: false, mutate };
  });
  it("renders loading, empty, success, and structured error states", () => {
    farmsState.isLoading = true; const { rerender } = render(<FarmsWorkspace />); expect(screen.getByLabelText("Loading farms")).toBeVisible();
    farmsState.isLoading = false; rerender(<FarmsWorkspace />); expect(screen.getByText("No farms yet")).toBeVisible();
    farmsState.data = [{ farm_id: "farm-1", name: "North Farm", created_at: "2026-08-03T00:00:00Z", updated_at: "2026-08-03T00:00:00Z" }]; rerender(<FarmsWorkspace />); expect(screen.getByText("North Farm")).toBeVisible();
    farmsState.data = undefined; farmsState.isError = true; farmsState.error = new CropTwinApiError({ kind: "backend", code: "STATE_NOT_FOUND", message: "missing", statusCode: 404 }); rerender(<FarmsWorkspace />); expect(screen.getByText(/requested farm, plot, or session was not found/i)).toBeVisible();
  });
  it("submits the create form and disables duplicate pending submission", async () => {
    const { rerender } = render(<FarmsWorkspace />);
    fireEvent.change(screen.getByLabelText("Farm name"), { target: { value: "North Farm" } }); fireEvent.submit(screen.getByRole("form", { name: "Create farm" }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith({ name: "North Farm" }, expect.any(Object)));
    createState.isPending = true; rerender(<FarmsWorkspace />); expect(screen.getByRole("button", { name: /creating farm/i })).toBeDisabled();
  });
});

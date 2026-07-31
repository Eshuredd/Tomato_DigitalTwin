import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CropTwinShell } from "./croptwin-shell";

describe("CropTwinShell", () => {
  it("renders the Phase 1 shell without fake workflow data", () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline")));

    render(<CropTwinShell />);

    expect(screen.getByRole("heading", { level: 1, name: "CropTwin" })).toBeInTheDocument();
    expect(screen.getByText("Tomato Irrigation and Disease Digital Twin")).toBeInTheDocument();
    expect(screen.getByText("Disease classification is supporting evidence only.")).toBeInTheDocument();
    expect(screen.getByText("Deterministic agronomy owns irrigation decisions.")).toBeInTheDocument();
    expect(screen.queryByText(/recommended action/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/late blight prediction/i)).not.toBeInTheDocument();
  });
});

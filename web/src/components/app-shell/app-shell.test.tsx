import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

describe("AppShell context header", () => {
  it.each(["/farms/farm-1", "/plots/plot-1", "/cycle/state-1"])(
    "does not invent selection state on %s",
    (path) => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      pathname = path;
      render(<AppShell><p>Workspace content</p></AppShell>);
      expect(screen.queryByText("No farm selected")).not.toBeInTheDocument();
      expect(screen.queryByText("No active cycle")).not.toBeInTheDocument();
      expect(screen.getByText("Milestone 2")).toBeVisible();
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    },
  );
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppSidebar } from "./app-sidebar";
import { navigationItems } from "./navigation";

describe("AppSidebar", () => {
  it("renders every application route", () => {
    render(<AppSidebar pathname="/" />);
    for (const item of navigationItems) expect(screen.getByRole("link", { name: new RegExp(item.label, "i") })).toHaveAttribute("href", item.href);
  });

  it("marks only the current route active", () => {
    render(<AppSidebar pathname="/history" />);
    expect(screen.getByRole("link", { name: /history/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /overview/i })).not.toHaveAttribute("aria-current");
  });
});

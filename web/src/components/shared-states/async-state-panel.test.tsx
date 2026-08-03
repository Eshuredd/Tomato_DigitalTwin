import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AsyncStatePanel } from "./async-state-panel";

describe("AsyncStatePanel", () => {
  it("uses a structured summary before technical details", () => {
    render(<AsyncStatePanel kind="error" description="The farm could not be loaded." technicalDetails={{ code: "STATE_NOT_FOUND" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("The farm could not be loaded.");
    expect(screen.getByText("Technical details")).toBeVisible();
    expect(screen.queryByText(/STATE_NOT_FOUND/)).not.toBeVisible();
  });

  it("distinguishes reused and newly created results with text", () => {
    const { rerender } = render(<AsyncStatePanel kind="reused" />);
    expect(screen.getByText("Existing result reused")).toBeVisible();
    rerender(<AsyncStatePanel kind="created" />);
    expect(screen.getByText("New result created")).toBeVisible();
  });
});

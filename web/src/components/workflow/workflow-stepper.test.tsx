import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WorkflowStepper, type WorkflowStep } from "./workflow-stepper";

const steps: WorkflowStep[] = [
  { id: "session", label: "Session", status: "completed", interactive: true },
  { id: "disease", label: "Disease evidence", status: "active", interactive: true, prerequisite: "session" },
  { id: "weather", label: "Weather", status: "available", interactive: true },
  { id: "water", label: "Water state", status: "blocked", prerequisite: "weather" },
  { id: "twin", label: "Twin update", status: "error", prerequisite: "water state" },
];

describe("WorkflowStepper", () => {
  it("exposes state and prerequisites as text", () => {
    render(<WorkflowStepper steps={steps} />);
    expect(screen.getByText("Completed")).toBeVisible();
    expect(screen.getByText("Active")).toBeVisible();
    expect(screen.getByText("Available")).toBeVisible();
    expect(screen.getByText("Blocked")).toBeVisible();
    expect(screen.getByText("Needs attention")).toBeVisible();
    expect(screen.getByText("Prerequisite: weather")).toBeVisible();
  });

  it("supports arrow, Home, End, and activation for interactive steps", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<WorkflowStepper steps={steps} onStepSelect={onSelect} />);
    const session = screen.getByRole("button", { name: /Session.*Completed/ });
    session.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: /Disease evidence.*Active/ })).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getByRole("button", { name: /Weather.*Available/ })).toHaveFocus();
    await user.keyboard("{Home}{Enter}");
    expect(session).toHaveFocus();
    expect(onSelect).toHaveBeenCalledWith(steps[0]);
  });
});

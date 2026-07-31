import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IrrigationInput } from "./irrigation-input";
import type { IrrigationDraftResult } from "./irrigation-utils";

describe("IrrigationInput", () => {
  it("keeps event identity across rerenders and changes it when the payload changes", async () => {
    const user = userEvent.setup();
    const changes: IrrigationDraftResult[] = [];
    const onChange = vi.fn((result: IrrigationDraftResult) => changes.push(result));

    const view = render(<IrrigationInput disabled={false} onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText("Input mode"), "direct");
    await user.clear(screen.getByLabelText("Irrigation depth (mm)"));
    await user.type(screen.getByLabelText("Irrigation depth (mm)"), "4");

    await waitFor(() => expect(changes.at(-1)?.event?.irrigation_event_id).toBeTruthy());
    const firstEventId = changes.at(-1)?.event?.irrigation_event_id;
    view.rerender(<IrrigationInput disabled={false} onChange={onChange} />);
    expect(changes.at(-1)?.event?.irrigation_event_id).toBe(firstEventId);

    await user.clear(screen.getByLabelText("Irrigation depth (mm)"));
    await user.type(screen.getByLabelText("Irrigation depth (mm)"), "5");

    await waitFor(() =>
      expect(changes.at(-1)?.event?.irrigation_event_id).not.toBe(firstEventId),
    );
  });

  it("does not retain a submit-ready event after invalid input", async () => {
    const user = userEvent.setup();
    const changes: IrrigationDraftResult[] = [];

    render(
      <IrrigationInput
        disabled={false}
        onChange={(result) => changes.push(result)}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Input mode"), "direct");
    await user.clear(screen.getByLabelText("Irrigation depth (mm)"));
    await user.type(screen.getByLabelText("Irrigation depth (mm)"), "4");
    await waitFor(() => expect(changes.at(-1)?.event?.irrigation_event_id).toBeTruthy());
    const firstEventId = changes.at(-1)?.event?.irrigation_event_id;

    await user.clear(screen.getByLabelText("Irrigation depth (mm)"));
    await user.type(screen.getByLabelText("Irrigation depth (mm)"), "-1");
    await waitFor(() => expect(changes.at(-1)?.valid).toBe(false));
    expect(changes.at(-1)?.event).toBeNull();

    await user.clear(screen.getByLabelText("Irrigation depth (mm)"));
    await user.type(screen.getByLabelText("Irrigation depth (mm)"), "4");
    await waitFor(() =>
      expect(changes.at(-1)?.event?.irrigation_event_id).not.toBe(firstEventId),
    );
  });

  it("does not generate an event ID for no irrigation", async () => {
    const randomUUID = vi.fn();
    vi.stubGlobal("crypto", { randomUUID });
    const changes: IrrigationDraftResult[] = [];

    render(
      <IrrigationInput
        disabled={false}
        onChange={(result) => changes.push(result)}
      />,
    );

    await waitFor(() => expect(changes.at(-1)?.signature).toBe("none"));
    expect(changes.at(-1)).toMatchObject({
      valid: true,
      event: null,
      error: null,
    });
    expect(randomUUID).not.toHaveBeenCalled();
  });
});

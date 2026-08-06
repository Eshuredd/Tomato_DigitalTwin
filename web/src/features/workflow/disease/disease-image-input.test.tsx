import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiseaseImageInput } from "./disease-image-input";

const create = vi.fn();
const revoke = vi.fn();

describe("DiseaseImageInput previews", () => {
  beforeEach(() => { vi.clearAllMocks(); let index = 0; create.mockImplementation(() => `blob:leaf-${++index}`); vi.spyOn(URL, "createObjectURL").mockImplementation(create); vi.spyOn(URL, "revokeObjectURL").mockImplementation(revoke); });
  afterEach(() => vi.restoreAllMocks());

  it("revokes replaced preview URLs", () => {
    render(<DiseaseImageInput onSelectionChange={vi.fn()} />);
    const input = screen.getByLabelText(/Choose one tomato leaf image/i);
    fireEvent.change(input, { target: { files: [new File(["a"], "a.png", { type: "image/png" })] } });
    fireEvent.change(input, { target: { files: [new File(["b"], "b.png", { type: "image/png" })] } });
    expect(revoke).toHaveBeenCalledWith("blob:leaf-1");
  });

  it("revokes its current preview on unmount", () => {
    const view = render(<DiseaseImageInput onSelectionChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Choose one tomato leaf image/i), { target: { files: [new File(["a"], "a.webp", { type: "image/webp" })] } });
    view.unmount();
    expect(revoke).toHaveBeenCalledWith("blob:leaf-1");
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccessibleForm } from "./accessible-form";

describe("AccessibleForm", () => {
  it("requires and applies a form-level accessible name", () => {
    render(<><h2 id="farm-form-title">Create farm</h2><AccessibleForm labelledBy="farm-form-title"><label htmlFor="farm-name">Farm name</label><input id="farm-name" /></AccessibleForm></>);
    expect(screen.getByRole("form", { name: "Create farm" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Farm name" })).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuthorityLegend } from "./authority";

describe("AuthorityLegend", () => {
  it("states deterministic and AI semantics in accessible text", () => {
    render(<AuthorityLegend />);
    expect(screen.getByText(/deterministic agronomy · authoritative/i)).toBeVisible();
    expect(screen.getByText(/AI evidence · supporting/i)).toBeVisible();
  });
});

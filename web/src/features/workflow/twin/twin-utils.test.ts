import { describe, expect, it } from "vitest";
import { twinSourceSignature } from "./twin-utils";

describe("canonical twin provenance", () => {
  it("changes for a new evidence acceptance even when the prediction is identical", () => {
    expect(twinSourceSignature("state-1", "acceptance-a", "water-1")).not.toBe(twinSourceSignature("state-1", "acceptance-b", "water-1"));
  });

  it("changes when canonical water lineage changes", () => {
    expect(twinSourceSignature("state-1", "acceptance-a", "water-1")).not.toBe(twinSourceSignature("state-1", "acceptance-a", "water-2"));
  });
});

import { describe, expect, it } from "vitest";
import { optionalFiniteNumber } from "./numbers";

describe("optionalFiniteNumber", () => {
  it("returns undefined for empty optional values", () => {
    expect(optionalFiniteNumber("", "Elevation")).toBeUndefined();
    expect(optionalFiniteNumber("   ", "Elevation")).toBeUndefined();
  });

  it("parses finite decimal values", () => {
    expect(optionalFiniteNumber(" 542.5 ", "Elevation")).toBe(542.5);
  });

  it.each(["not-a-number", "NaN", "Infinity", "-Infinity"])(
    "rejects %s",
    (value) => {
      expect(() => optionalFiniteNumber(value, "Elevation")).toThrow(
        "Elevation must be a finite number.",
      );
    },
  );
});

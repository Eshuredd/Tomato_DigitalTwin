import { describe, expect, it } from "vitest";
import { sessionPath } from "./paths";

describe("encoded API paths", () => {
  it("encodes dynamic identifiers", () => expect(sessionPath("state/with spaces", "history")).toBe("/sessions/state%2Fwith%20spaces/history"));
  it("rejects empty identifiers", () => expect(() => sessionPath("  ")).toThrow(/must not be empty/i));
});

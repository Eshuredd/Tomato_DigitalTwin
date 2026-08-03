import { describe, expect, it } from "vitest";
import { queryKeys } from "./query-keys";
import { createQueryClient } from "./query-client";

describe("query keys", () => {
  it("nests entity views under stable parents", () => {
    expect(queryKeys.plots("farm/one")).toEqual(["croptwin", "farms", "farm/one", "plots"]);
    expect(queryKeys.history("state-1")).toEqual(["croptwin", "sessions", "state-1", "history"]);
  });

  it("disables automatic mutation retries", () => {
    expect(createQueryClient().getDefaultOptions().mutations?.retry).toBe(false);
  });
});

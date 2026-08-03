import { describe, expect, it } from "vitest";
import { queryKeys } from "./query-keys";
import { createQueryClient } from "./query-client";

describe("query keys", () => {
  it("nests entity views under stable parents", () => {
    expect(queryKeys.plots("farm/one")).toEqual(["croptwin", "farms", "farm/one", "plots"]);
    expect(queryKeys.history("state-1")).toEqual(["croptwin", "sessions", "state-1", "history"]);
  });

  it("keeps date, limit, farm, and state scopes distinct", () => {
    expect(queryKeys.weatherSnapshot("state-1", "2026-08-03")).not.toEqual(queryKeys.weatherSnapshot("state-1", "2026-08-04"));
    expect(queryKeys.actualActions("state-1", 20)).not.toEqual(queryKeys.actualActions("state-1", 50));
    expect(queryKeys.session("state-1")).not.toEqual(queryKeys.session("state-2"));
    expect(queryKeys.plots("farm-1")).not.toEqual(queryKeys.plots("farm-2"));
  });

  it("targets only one farm plot list for invalidation", async () => {
    const client = createQueryClient();
    client.setQueryData(queryKeys.plots("farm-1"), []);
    client.setQueryData(queryKeys.plots("farm-2"), []);
    await client.invalidateQueries({ queryKey: queryKeys.plots("farm-1"), exact: true });
    expect(client.getQueryState(queryKeys.plots("farm-1"))?.isInvalidated).toBe(true);
    expect(client.getQueryState(queryKeys.plots("farm-2"))?.isInvalidated).toBe(false);
  });

  it("disables automatic mutation retries", () => {
    expect(createQueryClient().getDefaultOptions().mutations?.retry).toBe(false);
  });
});

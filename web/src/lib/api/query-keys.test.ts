import { describe, expect, it } from "vitest";
import { queryKeys } from "./query-keys";
import { createQueryClient } from "./query-client";

describe("query keys", () => {
  it("nests entity views under stable parents", () => {
    expect(queryKeys.plots("farm/one")).toEqual(["croptwin", "farms", "farm/one", "plots"]);
    expect(queryKeys.history("state-1")).toEqual(["croptwin", "sessions", "state-1", "history"]);
    expect(queryKeys.waterState("state-1")).toEqual(["croptwin", "sessions", "state-1", "water-state"]);
    expect(queryKeys.twinState("state-1")).toEqual(["croptwin", "sessions", "state-1", "twin-state"]);
    expect(queryKeys.advancement("state-1", "advance-1")).toEqual(["croptwin", "sessions", "state-1", "advancement", "advance-1"]);
    expect(queryKeys.simulation("state-1")).toEqual(["croptwin", "sessions", "state-1", "simulation"]);
    expect(queryKeys.recommendation("state-1")).toEqual(["croptwin", "sessions", "state-1", "recommendation"]);
    expect(queryKeys.narration("state-1")).toEqual(["croptwin", "sessions", "state-1", "narration"]);
  });

  it("keeps date, limit, farm, and state scopes distinct", () => {
    expect(queryKeys.weatherSnapshot("state-1", "2026-08-03")).not.toEqual(queryKeys.weatherSnapshot("state-1", "2026-08-04"));
    expect(queryKeys.actualActions("state-1", 20)).not.toEqual(queryKeys.actualActions("state-1", 50));
    expect(queryKeys.session("state-1")).not.toEqual(queryKeys.session("state-2"));
    expect(queryKeys.diseaseEvidence("state-1")).not.toEqual(queryKeys.diseaseEvidence("state-2"));
    expect(queryKeys.plots("farm-1")).not.toEqual(queryKeys.plots("farm-2"));
  });

  it("does not expose disease evidence across state IDs", () => {
    const client = createQueryClient();
    client.setQueryData(queryKeys.diseaseEvidence("state-1"), { response: { state_id: "state-1" } });
    expect(client.getQueryData(queryKeys.diseaseEvidence("state-2"))).toBeUndefined();
  });

  it("targets only one farm plot list for invalidation", async () => {
    const client = createQueryClient();
    client.setQueryData(queryKeys.plots("farm-1"), []);
    client.setQueryData(queryKeys.plots("farm-2"), []);
    await client.invalidateQueries({ queryKey: queryKeys.plots("farm-1"), exact: true });
    expect(client.getQueryState(queryKeys.plots("farm-1"))?.isInvalidated).toBe(true);
    expect(client.getQueryState(queryKeys.plots("farm-2"))?.isInvalidated).toBe(false);
  });

  it("invalidates every actual-action limit for one state only", async () => {
    const client = createQueryClient();
    client.setQueryData(queryKeys.actualActions("state-1", 25), []);
    client.setQueryData(queryKeys.actualActions("state-1", 50), []);
    client.setQueryData(queryKeys.actualActions("state-2", 50), []);
    await client.invalidateQueries({ queryKey: queryKeys.actualActionsRoot("state-1") });
    expect(client.getQueryState(queryKeys.actualActions("state-1", 25))?.isInvalidated).toBe(true);
    expect(client.getQueryState(queryKeys.actualActions("state-1", 50))?.isInvalidated).toBe(true);
    expect(client.getQueryState(queryKeys.actualActions("state-2", 50))?.isInvalidated).toBe(false);
  });

  it("disables automatic mutation retries", () => {
    expect(createQueryClient().getDefaultOptions().mutations?.retry).toBe(false);
  });
});

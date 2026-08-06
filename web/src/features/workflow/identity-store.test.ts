import { describe, expect, it } from "vitest";
import { WorkflowIdentityStore } from "./identity-store";

describe("route-scoped workflow identity store", () => {
  it("reuses water update identity until payload semantics change", () => { const store = new WorkflowIdentityStore(); const first = store.waterId("same"); expect(store.waterId("same")).toBe(first); expect(store.waterId("changed")).not.toBe(first); });
  it("keeps initial and next-day irrigation identities separate", () => { const store = new WorkflowIdentityStore(); const initial = store.irrigationId("water", "event"); const nextDay = store.irrigationId("advancement", "event"); expect(nextDay).not.toBe(initial); expect(store.irrigationId("water", "event")).toBe(initial); });
  it("retains advancement identity for exact retry and clears it for a new base", () => { const store = new WorkflowIdentityStore(); const first = store.advancementId("payload"); expect(store.advancementId("payload")).toBe(first); store.clearAdvancement(); expect(store.advancementId("payload")).not.toBe(first); });
  it("clears a conflicted water identity", () => { const store = new WorkflowIdentityStore(); const first = store.waterId("payload"); store.clearWater(); expect(store.waterId("payload")).not.toBe(first); });
});

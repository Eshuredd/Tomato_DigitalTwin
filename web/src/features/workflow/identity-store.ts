import { stableIdentity, type StableIdentity } from "./identity";

export class WorkflowIdentityStore {
  private irrigation = new Map<"water" | "advancement", StableIdentity>();
  private water?: StableIdentity;
  private advancement?: StableIdentity;

  irrigationId(scope: "water" | "advancement", signature: string) {
    const identity = stableIdentity(this.irrigation.get(scope), signature);
    this.irrigation.set(scope, identity);
    return identity.id;
  }
  waterId(signature: string) { this.water = stableIdentity(this.water, signature); return this.water.id; }
  advancementId(signature: string) { this.advancement = stableIdentity(this.advancement, signature); return this.advancement.id; }
  clearWater() { this.water = undefined; }
  clearAdvancement() { this.advancement = undefined; this.irrigation.delete("advancement"); }
}

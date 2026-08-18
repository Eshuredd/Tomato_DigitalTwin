import type { AdvanceOneDayRequest, ComputeWaterStateRequest, WaterStateResponse } from '@/lib/api';
import type { ReviewedIrrigation, ReviewedWeather } from './drafts';

export interface WaterBaseline { observationId: string; sequence: number }

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

export function createRequestId(prefix: 'water' | 'advance', now = Date.now(), random = Math.random()): string {
  return `mobile-${prefix}-${now.toString(36)}-${Math.floor(random * 0x100000000).toString(36)}`;
}

export class WorkflowRequestIdentityStore {
  private water = new Map<string, string>();
  private advancement = new Map<string, string>();
  constructor(readonly stateId: string, private readonly factory = createRequestId) {}
  waterId(signature: string) { const current = this.water.get(signature); if (current) return current; const id = this.factory('water'); this.water.set(signature, id); return id; }
  advancementId(signature: string) { const current = this.advancement.get(signature); if (current) return current; const id = this.factory('advance'); this.advancement.set(signature, id); return id; }
  clearWater(signature?: string) { if (signature) this.water.delete(signature); else this.water.clear(); }
  clearAdvancement(signature?: string) { if (signature) this.advancement.delete(signature); else this.advancement.clear(); }
}

export function waterBaseline(result?: WaterStateResponse): WaterBaseline | undefined {
  if (!result) return undefined;
  if (result.water_sequence === 0 && !result.water_observation_id) return undefined;
  if (!result.water_observation_id || result.water_sequence <= 0) throw new Error('Canonical water lineage is inconsistent.');
  return { observationId: result.water_observation_id, sequence: result.water_sequence };
}

export function buildWaterSemanticPayload(stateId: string, weather: ReviewedWeather, irrigation: ReviewedIrrigation, baseline?: WaterBaseline) {
  if (weather.stateId !== stateId || irrigation.stateId !== stateId) throw new Error('Reviewed input belongs to another session.');
  return { state_id: stateId, current_date: weather.targetDate, weather: weather.weather, last_irrigation_event: irrigation.event, ...(baseline ? { base_water_observation_id: baseline.observationId, base_water_sequence: baseline.sequence } : {}) };
}

export function buildComputeWaterRequest(stateId: string, weather: ReviewedWeather, irrigation: ReviewedIrrigation, waterUpdateId: string, baseline?: WaterBaseline): ComputeWaterStateRequest {
  return { ...buildWaterSemanticPayload(stateId, weather, irrigation, baseline), water_update_id: waterUpdateId };
}

export function buildAdvancementRequest(stateId: string, targetDate: string, weather: ReviewedWeather, irrigation: ReviewedIrrigation, advancementId: string): AdvanceOneDayRequest {
  if (weather.stateId !== stateId || irrigation.stateId !== stateId) throw new Error('Reviewed advancement input belongs to another session.');
  if (weather.targetDate !== targetDate) throw new Error('Accepted weather does not match the required advancement date.');
  return { state_id: stateId, advancement_id: advancementId, target_date: targetDate, weather: weather.weather, last_irrigation_event: irrigation.event };
}

export type AdvancementTransition = 'new' | 'current_reuse' | 'catch_up_reuse' | 'historical_reuse';
export function classifyAdvancement(created: boolean, responseSequence: number, currentSequence: number): AdvancementTransition {
  if (created) return 'new';
  if (responseSequence > currentSequence) return 'catch_up_reuse';
  if (responseSequence === currentSequence) return 'current_reuse';
  return 'historical_reuse';
}

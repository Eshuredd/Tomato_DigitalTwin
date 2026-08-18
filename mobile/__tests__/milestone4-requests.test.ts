import type { ReviewedIrrigation, ReviewedWeather } from '@/features/workflow/drafts';
import { buildAdvancementRequest, buildComputeWaterRequest, buildWaterSemanticPayload, canonicalJson, classifyAdvancement, createRequestId, waterBaseline, WorkflowRequestIdentityStore } from '@/features/workflow/requests';
import { nextUtcCalendarDate } from '@/lib/dates/local-date';
import { queryKeys } from '@/lib/api';
import { waterState } from '../test-support/milestone4-fixtures';

const weather: ReviewedWeather = { stateId: 'state-a', targetDate: '2026-08-18', provenance: 'manual', weather: { tmin_c: 0, tmax_c: 30, humidity_pct: 0, wind_speed_mps: 0, rainfall_mm: 0 } };
const none: ReviewedIrrigation = { stateId: 'state-a', event: null, distinction: 'no_irrigation', details: {} };
const zero: ReviewedIrrigation = { stateId: 'state-a', event: { timestamp: '2026-08-18T06:30:00+05:30', amount_mm: 0, source: 'MANUAL' }, distinction: 'explicit_zero', details: { amount_mm: 0 } };

describe('Milestone 4 request preparation', () => {
  it('maps reviewed weather exactly, preserves zeros, omits optional fields, and keeps no irrigation null', () => { const input = buildComputeWaterRequest('state-a', weather, none, 'water-id'); expect(input).toEqual({ state_id: 'state-a', water_update_id: 'water-id', current_date: '2026-08-18', weather: weather.weather, last_irrigation_event: null }); expect(JSON.stringify(input)).not.toContain('observed_at'); expect(JSON.stringify(input)).not.toContain('base_water_'); expect(input.weather).not.toHaveProperty('eto_reference_feed'); });
  it('preserves a real zero irrigation event and its aware timestamp', () => { const input = buildComputeWaterRequest('state-a', weather, zero, 'water-id'); expect(input.last_irrigation_event).toEqual(zero.event); expect(input.last_irrigation_event).not.toBeNull(); });
  it('uses only authoritative returned lineage for a guarded request', () => { const baseline = waterBaseline(waterState); const input = buildComputeWaterRequest('state-a', weather, none, 'next-id', baseline); expect(input).toMatchObject({ base_water_observation_id: 'water-1', base_water_sequence: 1 }); });
  it('rejects cross-session accepted drafts', () => { expect(() => buildWaterSemanticPayload('state-b', weather, none)).toThrow('another session'); });
  it('keeps water, twin, advancement, and accepted inputs isolated across sessions', () => { expect(queryKeys.waterState('state-a')).not.toEqual(queryKeys.waterState('state-b')); expect(queryKeys.twinState('state-a')).not.toEqual(queryKeys.twinState('state-b')); expect(queryKeys.advancement('state-a', 'advance')).not.toEqual(queryKeys.advancement('state-b', 'advance')); expect(() => buildAdvancementRequest('state-b', '2026-08-18', weather, none, 'advance')).toThrow('another session'); });
  it('binds advancement weather to the exact required date', () => { expect(() => buildAdvancementRequest('state-a', '2026-08-19', weather, none, 'advance')).toThrow('required advancement date'); const nextWeather = { ...weather, targetDate: '2026-08-19' }; expect(buildAdvancementRequest('state-a', '2026-08-19', nextWeather, zero, 'advance')).toMatchObject({ target_date: '2026-08-19', last_irrigation_event: zero.event }); });
  it('derives exactly one UTC calendar day without local timezone shifting', () => { expect(nextUtcCalendarDate('2026-12-31T00:00:00Z')).toBe('2027-01-01'); expect(nextUtcCalendarDate('2026-08-18T23:30:00+05:30')).toBe('2026-08-19'); });
});

describe('Milestone 4 request identity and retry semantics', () => {
  it('reuses IDs for exact payloads and creates new IDs for changed payloads', () => { let counter = 0; const store = new WorkflowRequestIdentityStore('state-a', (prefix) => `${prefix}-${++counter}`); expect(store.waterId('same')).toBe('water-1'); expect(store.waterId('same')).toBe('water-1'); expect(store.waterId('changed')).toBe('water-2'); expect(store.advancementId('same')).toBe('advance-3'); expect(store.advancementId('same')).toBe('advance-3'); });
  it('discards an old identity when explicitly cleared for rebase/conflict', () => { let counter = 0; const store = new WorkflowRequestIdentityStore('state-a', () => `id-${++counter}`); expect(store.waterId('payload')).toBe('id-1'); store.clearWater('payload'); expect(store.waterId('payload')).toBe('id-2'); });
  it('generates React Native-safe bounded non-empty IDs', () => { expect(createRequestId('water', 1, 0.5)).toMatch(/^mobile-water-/); expect(createRequestId('water').length).toBeLessThanOrEqual(160); expect(createRequestId('advance').length).toBeLessThanOrEqual(120); });
  it('uses canonical payload signatures and classifies idempotent advancement lineage', () => { expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 })); expect(classifyAdvancement(true, 2, 1)).toBe('new'); expect(classifyAdvancement(false, 2, 2)).toBe('current_reuse'); expect(classifyAdvancement(false, 3, 2)).toBe('catch_up_reuse'); expect(classifyAdvancement(false, 1, 2)).toBe('historical_reuse'); });
});

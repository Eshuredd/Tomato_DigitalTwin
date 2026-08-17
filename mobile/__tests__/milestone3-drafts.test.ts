import { QueryClient } from '@tanstack/react-query';
import { diseasePredictionSchema, queryKeys } from '@/lib/api';
import { awareIsoFromLocalDateTime, localDateTimeInput } from '@/lib/dates/local-date';
import { depthFromLitres, reviewIrrigation, reviewWeather, weatherReviewSchema, type IrrigationDraft } from '@/features/workflow/drafts';
import { decodedBase64Bytes, imageDraftFromPicker, imageDraftMatchesSession, rawBase64 } from '@/features/workflow/media';

const irrigation = (values: Partial<IrrigationDraft> = {}): IrrigationDraft => ({ mode: 'direct', timestamp: '2026-08-17T10:30', directDepth: '0', totalLitres: '', litresArea: '', emitterCount: '', emitterFlow: '', runtimeMinutes: '', dripArea: '', ...values });
const weather = { target_date: '2026-08-17', tmin_c: '0', tmax_c: '30', humidity_pct: '0', wind_speed_mps: '0', shortwave_radiation_sum_mj_m2: '', rainfall_mm: '0', eto_reference_feed: '' };

describe('Milestone 3 draft boundaries', () => {
  it('treats picker cancellation as no draft and strips data URL prefixes', () => { expect(imageDraftFromPicker('a', { canceled: true, assets: null })).toBeUndefined(); expect(rawBase64('data:image/jpeg;base64,aGVsbG8=')).toBe('aGVsbG8='); expect(decodedBase64Bytes('aGVsbG8=')).toBe(5); });
  it('rejects images above the backend pixel limit', () => { expect(() => imageDraftFromPicker('a', { canceled: false, assets: [{ uri: 'file://large.jpg', width: 5001, height: 5000, base64: 'aA==' }] })).toThrow('25 million pixels or fewer'); });
  it('keeps selected media scoped to its session', () => { const draft = imageDraftFromPicker('state-a', { canceled: false, assets: [{ uri: 'file://leaf.jpg', width: 20, height: 10, base64: 'aGVsbG8=' }] }); expect(imageDraftMatchesSession(draft, 'state-a')).toBe(true); expect(imageDraftMatchesSession(draft, 'state-b')).toBe(false); });
  it('parses returned disease evidence without image bytes', () => { const parsed = diseasePredictionSchema.parse({ state_id: 'a', crop_type: 'tomato', predicted_label: 'healthy', disease_category: 'none', class_probs: { healthy: 1 }, confidence_calibrated: 1, uncertainty_score: 0, uncertainty_band: 'low', predicted_at: 'now' }); expect(JSON.stringify(parsed)).not.toContain('image_base64'); });
  it('keeps disease query caches isolated by state', () => { const client = new QueryClient(); client.setQueryData(queryKeys.diseaseEvidence('a'), { response: { state_id: 'a' } }); expect(client.getQueryData(queryKeys.diseaseEvidence('b'))).toBeUndefined(); client.clear(); });
  it('preserves required weather zero and omits optional blanks', () => { const reviewed = reviewWeather('state-a', weather, 'manual'); expect(reviewed.weather).toEqual({ tmin_c: 0, tmax_c: 30, humidity_pct: 0, wind_speed_mps: 0, rainfall_mm: 0 }); expect(reviewed.stateId).toBe('state-a'); });
  it.each(['', ' ', 'bad', 'NaN', 'Infinity', '-Infinity'])('rejects invalid required weather %p', (rainfall_mm) => expect(weatherReviewSchema.safeParse({ ...weather, rainfall_mm }).success).toBe(false));
  it('enforces weather bounds', () => { expect(weatherReviewSchema.safeParse({ ...weather, humidity_pct: '101' }).success).toBe(false); expect(weatherReviewSchema.safeParse({ ...weather, wind_speed_mps: '-1' }).success).toBe(false); });
  it('keeps weather query keys isolated by state and date', () => { expect(queryKeys.weatherSnapshot('a', '2026-08-17')).not.toEqual(queryKeys.weatherSnapshot('b', '2026-08-17')); expect(queryKeys.weatherSnapshot('a', '2026-08-17')).not.toEqual(queryKeys.weatherSnapshot('a', '2026-08-18')); });
  it('distinguishes no irrigation from explicit zero', () => { expect(reviewIrrigation('a', irrigation({ mode: 'none' })).distinction).toBe('no_irrigation'); const zero = reviewIrrigation('a', irrigation()); expect(zero.distinction).toBe('explicit_zero'); expect(zero.event?.amount_mm).toBe(0); expect(zero.stateId).toBe('a'); });
  it.each(['', ' ', 'bad', 'NaN', 'Infinity', '-Infinity', '-1'])('rejects invalid direct irrigation %p', (directDepth) => expect(() => reviewIrrigation('a', irrigation({ directDepth }))).toThrow());
  it('converts litres per square metre to millimetres', () => expect(depthFromLitres(100, 20)).toBe(5));
  it('validates drip inputs and preserves zero runtime', () => { const reviewed = reviewIrrigation('a', irrigation({ mode: 'drip_runtime', emitterCount: '10', emitterFlow: '2', runtimeMinutes: '0', dripArea: '5' })); expect(reviewed.event?.amount_mm).toBe(0); expect(reviewed.event?.source).toBe('CONVERTED_FROM_DRIP_RUNTIME'); });
  it('creates an aware timestamp from valid local input', () => { const value = '2026-08-17T10:30'; expect(localDateTimeInput(new Date(value))).toBe(value); expect(awareIsoFromLocalDateTime(value)).toMatch(/Z$/); expect(() => awareIsoFromLocalDateTime('2026-02-30T10:30')).toThrow(); });
});

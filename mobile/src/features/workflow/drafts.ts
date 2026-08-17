import { z } from 'zod';
import type { LastIrrigationEvent, WeatherInput, WeatherSnapshot } from '@/lib/api';
import { awareIsoFromLocalDateTime } from '@/lib/dates/local-date';
import { calendarDateSchema } from '@/lib/forms/fields';

const finiteText = (label: string, min?: number, max?: number) => z.string().refine((value) => value.trim() !== '', `${label} is required.`).transform((value, context) => {
  const number = Number(value.trim());
  if (!Number.isFinite(number)) { context.addIssue({ code: 'custom', message: `${label} must be a finite number.` }); return z.NEVER; }
  if (min !== undefined && number < min) { context.addIssue({ code: 'custom', message: `${label} must be at least ${min}.` }); return z.NEVER; }
  if (max !== undefined && number > max) { context.addIssue({ code: 'custom', message: `${label} must be at most ${max}.` }); return z.NEVER; }
  return number;
});
const optionalFiniteText = (label: string, min?: number) => z.string().optional().transform((value, context) => {
  if (value === undefined || value.trim() === '') return undefined;
  const number = Number(value.trim());
  if (!Number.isFinite(number)) { context.addIssue({ code: 'custom', message: `${label} must be a finite number.` }); return z.NEVER; }
  if (min !== undefined && number < min) { context.addIssue({ code: 'custom', message: `${label} must be at least ${min}.` }); return z.NEVER; }
  return number;
});

export const weatherReviewSchema = z.object({
  target_date: calendarDateSchema, tmin_c: finiteText('Minimum temperature'), tmax_c: finiteText('Maximum temperature'),
  humidity_pct: finiteText('Humidity', 0, 100), wind_speed_mps: finiteText('Wind speed', 0),
  shortwave_radiation_sum_mj_m2: optionalFiniteText('Shortwave radiation', 0), rainfall_mm: finiteText('Rainfall', 0), eto_reference_feed: optionalFiniteText('Reference ETo'),
});
export type WeatherReviewInput = z.input<typeof weatherReviewSchema>;
export interface ReviewedWeather { stateId: string; targetDate: string; weather: WeatherInput; provenance: 'fetched_reviewed' | 'manual' }
export function reviewWeather(stateId: string, input: WeatherReviewInput, provenance: ReviewedWeather['provenance']): ReviewedWeather {
  const parsed = weatherReviewSchema.parse(input);
  const weather: WeatherInput = { tmin_c: parsed.tmin_c, tmax_c: parsed.tmax_c, humidity_pct: parsed.humidity_pct, wind_speed_mps: parsed.wind_speed_mps, rainfall_mm: parsed.rainfall_mm, ...(parsed.shortwave_radiation_sum_mj_m2 === undefined ? {} : { shortwave_radiation_sum_mj_m2: parsed.shortwave_radiation_sum_mj_m2 }), ...(parsed.eto_reference_feed === undefined ? {} : { eto_reference_feed: parsed.eto_reference_feed }) };
  return { stateId, targetDate: parsed.target_date, weather, provenance };
}
export function weatherValues(snapshot: WeatherSnapshot): WeatherReviewInput { return { target_date: snapshot.target_date, tmin_c: String(snapshot.tmin_c), tmax_c: String(snapshot.tmax_c), humidity_pct: String(snapshot.humidity_pct), wind_speed_mps: String(snapshot.wind_speed_mps), shortwave_radiation_sum_mj_m2: String(snapshot.shortwave_radiation_sum_mj_m2), rainfall_mm: String(snapshot.rainfall_mm), eto_reference_feed: String(snapshot.eto_reference_feed) }; }

export type IrrigationMode = 'none' | 'direct' | 'litres_area' | 'drip_runtime';
export interface IrrigationDraft { mode: IrrigationMode; timestamp: string; directDepth: string; totalLitres: string; litresArea: string; emitterCount: string; emitterFlow: string; runtimeMinutes: string; dripArea: string }
export interface ReviewedIrrigation { stateId: string; event: Omit<LastIrrigationEvent, 'irrigation_event_id'> | null; distinction: 'no_irrigation' | 'explicit_zero' | 'positive_depth'; details: Record<string, number> }
function requiredNumber(value: string, label: string) { return finiteText(label).parse(value); }
export function depthFromLitres(litres: number, areaM2: number) { if (!Number.isFinite(litres) || litres < 0) throw new Error('Total litres must be a finite non-negative number.'); if (!Number.isFinite(areaM2) || areaM2 <= 0) throw new Error('Irrigated area must be a finite number greater than zero.'); return litres / areaM2; }
export function reviewIrrigation(stateId: string, draft: IrrigationDraft): ReviewedIrrigation {
  if (draft.mode === 'none') return { stateId, event: null, distinction: 'no_irrigation', details: {} };
  const timestamp = awareIsoFromLocalDateTime(draft.timestamp); let amount: number; let source: NonNullable<ReviewedIrrigation['event']>['source']; let details: Record<string, number>;
  if (draft.mode === 'direct') { amount = requiredNumber(draft.directDepth, 'Irrigation depth'); if (amount < 0) throw new Error('Irrigation depth must be non-negative.'); source = 'MANUAL'; details = { amount_mm: amount }; }
  else if (draft.mode === 'litres_area') { const litres = requiredNumber(draft.totalLitres, 'Total litres'); const area = requiredNumber(draft.litresArea, 'Irrigated area'); amount = depthFromLitres(litres, area); source = 'CONVERTED_FROM_LITRES'; details = { total_litres: litres, irrigated_area_m2: area }; }
  else { const count = requiredNumber(draft.emitterCount, 'Emitter count'); const flow = requiredNumber(draft.emitterFlow, 'Emitter flow'); const minutes = requiredNumber(draft.runtimeMinutes, 'Runtime'); const area = requiredNumber(draft.dripArea, 'Irrigated area'); if (!Number.isInteger(count) || count <= 0) throw new Error('Emitter count must be a positive integer.'); if (flow <= 0) throw new Error('Emitter flow must be greater than zero.'); if (minutes < 0) throw new Error('Runtime must be non-negative.'); const litres = count * flow * minutes / 60; amount = depthFromLitres(litres, area); source = 'CONVERTED_FROM_DRIP_RUNTIME'; details = { emitter_count: count, emitter_flow_lph: flow, runtime_minutes: minutes, irrigated_area_m2: area, total_litres: litres }; }
  return { stateId, event: { timestamp, amount_mm: amount, source }, distinction: amount === 0 ? 'explicit_zero' : 'positive_depth', details };
}

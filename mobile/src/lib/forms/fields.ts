import { z } from 'zod';
import { soilTextureSchema } from '@/lib/api/contracts';
import type { CreatePlotInput, CreateSessionInput } from '@/lib/api/contracts';

export function requiredFiniteNumber(label: string, min: number, max: number) {
  return z.string().refine((value) => value.trim() !== '', `${label} is required.`).transform((value, context) => {
    const parsed = Number(value.trim());
    if (!Number.isFinite(parsed)) { context.addIssue({ code: 'custom', message: `${label} must be a finite number.` }); return z.NEVER; }
    return parsed;
  }).pipe(z.number().min(min, `${label} must be at least ${min}.`).max(max, `${label} must be at most ${max}.`));
}

export function optionalElevation() {
  return z.string().optional().transform((value, context) => {
    if (value === undefined || value.trim() === '') return undefined;
    const parsed = Number(value.trim());
    if (!Number.isFinite(parsed)) { context.addIssue({ code: 'custom', message: 'Elevation must be a finite number.' }); return z.NEVER; }
    if (parsed < -500) { context.addIssue({ code: 'custom', message: 'Elevation must be at least -500 m.' }); return z.NEVER; }
    return parsed;
  });
}

export const farmFormSchema = z.object({ name: z.string().trim().min(1, 'Farm name is required.').max(200) });
export const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').refine((value) => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}, 'Enter a valid calendar date.');
export const locationFormFields = {
  location_name: z.string().trim().min(1, 'Location name is required.'),
  latitude: requiredFiniteNumber('Latitude', -90, 90), longitude: requiredFiniteNumber('Longitude', -180, 180), elevation: optionalElevation(),
  soil_texture: soilTextureSchema,
};
export const plotFormSchema = z.object({ name: z.string().trim().min(1, 'Plot name is required.').max(200), ...locationFormFields });
export const sessionFormSchema = z.object({ planting_date: calendarDateSchema, ...locationFormFields });
export const cropCycleFormSchema = z.object({ planting_date: calendarDateSchema });
export const stateIdSchema = z.string().trim().min(1, 'State ID is required.');

export function locationPayload(value: { location_name: string; latitude: number; longitude: number; elevation?: number }) {
  return { name: value.location_name, latitude: value.latitude, longitude: value.longitude, ...(value.elevation === undefined ? {} : { elevation_m: value.elevation }) };
}
export function buildPlotPayload(value: z.output<typeof plotFormSchema>): CreatePlotInput { return { name: value.name, location: locationPayload(value), soil_texture: value.soil_texture }; }
export function buildSessionPayload(value: z.output<typeof sessionFormSchema>): CreateSessionInput { return { crop_type: 'tomato', planting_date: value.planting_date, location: locationPayload(value), soil_texture: value.soil_texture }; }
export function normalizeStateId(value: string): string { return stateIdSchema.parse(value); }

import { buildPlotPayload, buildSessionPayload, cropCycleFormSchema, normalizeStateId, optionalElevation, plotFormSchema, requiredFiniteNumber, sessionFormSchema } from '@/lib/forms/fields';
import { localCalendarDate } from '@/lib/dates/local-date';
import { soilTextures } from '@/lib/api/contracts';

describe('Milestone 2 input parsing', () => {
  const coordinate = requiredFiniteNumber('Coordinate', -90, 90);
  it.each(['', '   '])('rejects blank coordinate %p', (value) => expect(coordinate.safeParse(value).success).toBe(false));
  it.each(['tomato', '12x', 'NaN', 'Infinity', '-Infinity'])('rejects malformed or non-finite coordinate %p', (value) => expect(coordinate.safeParse(value).success).toBe(false));
  it.each([['0', 0], ['-90', -90], ['90', 90]])('accepts coordinate %p as %p', (value, expected) => expect(coordinate.parse(value)).toBe(expected));
  it.each(['-90.1', '90.1'])('enforces coordinate bounds for %p', (value) => expect(coordinate.safeParse(value).success).toBe(false));

  const elevation = optionalElevation();
  it.each([[undefined, undefined], ['', undefined], ['  ', undefined], ['0', 0], ['-500', -500], ['42.5', 42.5]])('parses elevation %p as %p', (value, expected) => expect(elevation.parse(value)).toBe(expected));
  it.each(['bad', 'NaN', 'Infinity', '-500.01'])('rejects elevation %p', (value) => expect(elevation.safeParse(value).success).toBe(false));

  const base = { name: 'North', location_name: 'Field', latitude: '0', longitude: '0', elevation: '', soil_texture: 'sandy_loam' as const };
  it('builds exact nested plot payload and omits blank elevation', () => expect(buildPlotPayload(plotFormSchema.parse(base))).toEqual({ name: 'North', location: { name: 'Field', latitude: 0, longitude: 0 }, soil_texture: 'sandy_loam' }));
  it('preserves explicit zero elevation in plot payload', () => expect(buildPlotPayload(plotFormSchema.parse({ ...base, elevation: '0' })).location.elevation_m).toBe(0));
  it('builds exact standalone tomato payload', () => expect(buildSessionPayload(sessionFormSchema.parse({ ...base, planting_date: '2026-08-13' }))).toEqual({ crop_type: 'tomato', planting_date: '2026-08-13', location: { name: 'Field', latitude: 0, longitude: 0 }, soil_texture: 'sandy_loam' }));
  it('preserves standalone explicit zero elevation', () => expect(buildSessionPayload(sessionFormSchema.parse({ ...base, elevation: '0', planting_date: '2026-08-13' })).location.elevation_m).toBe(0));
  it('uses only backend soil options', () => expect(soilTextures).toEqual(['sand', 'sandy_loam', 'loam', 'silty_loam', 'clay_loam', 'clay']));
  it('keeps crop-cycle payload exact', () => expect({ crop_type: 'tomato', ...cropCycleFormSchema.parse({ planting_date: '2026-08-13' }) }).toEqual({ crop_type: 'tomato', planting_date: '2026-08-13' }));
  it.each(['2026-02-29', '2026-13-01', '2026-00-10'])('rejects impossible calendar date %p', (planting_date) => expect(cropCycleFormSchema.safeParse({ planting_date }).success).toBe(false));
  it('trims state identifiers and rejects blank IDs', () => { expect(normalizeStateId(' state/a ')).toBe('state/a'); expect(() => normalizeStateId('  ')).toThrow(); });
  it('formats a local calendar boundary without UTC serialization', () => expect(localCalendarDate(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01'));
});

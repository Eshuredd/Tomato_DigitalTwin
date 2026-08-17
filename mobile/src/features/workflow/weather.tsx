import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Text } from 'react-native';
import { EmptyState, ErrorState, FormField, MetricRow, PrimaryButton, SectionCard, TechnicalDetails } from '@/components/ui';
import { toUserFacingError } from '@/lib/api';
import { localCalendarDate } from '@/lib/dates/local-date';
import { calendarDateSchema } from '@/lib/forms/fields';
import { useWeatherSnapshot } from './hooks';
import { reviewWeather, weatherReviewSchema, weatherValues, type ReviewedWeather, type WeatherReviewInput } from './drafts';

const defaults = (): WeatherReviewInput => ({ target_date: localCalendarDate(), tmin_c: '', tmax_c: '', humidity_pct: '', wind_speed_mps: '', shortwave_radiation_sum_mj_m2: '', rainfall_mm: '', eto_reference_feed: '' });
const fields = [
  ['tmin_c', 'Minimum temperature (°C)'], ['tmax_c', 'Maximum temperature (°C)'], ['humidity_pct', 'Mean humidity (%)'], ['wind_speed_mps', 'Wind speed at crop height (m/s)'], ['shortwave_radiation_sum_mj_m2', 'Shortwave radiation (MJ/m²), optional'], ['rainfall_mm', 'Rainfall (mm)'], ['eto_reference_feed', 'Reference ETo (mm), optional'],
] as const;

export function WeatherWorkflow({ stateId }: { stateId: string }) {
  const form = useForm<WeatherReviewInput>({ defaultValues: defaults() }); const targetDate = useWatch({ control: form.control, name: 'target_date' });
  const snapshot = useWeatherSnapshot(stateId, targetDate); const [provenance, setProvenance] = useState<ReviewedWeather['provenance']>('manual'); const [reviewed, setReviewed] = useState<ReviewedWeather>();
  async function retrieve() { const parsed = calendarDateSchema.safeParse(targetDate); if (!parsed.success) { form.setError('target_date', { message: parsed.error.issues[0]?.message }); return; } const result = await snapshot.refetch(); if (result.data) { form.reset(weatherValues(result.data)); setProvenance('fetched_reviewed'); setReviewed(undefined); } }
  function edit(name: keyof WeatherReviewInput, value: string, onChange: (value: string) => void) { onChange(value); setProvenance('manual'); setReviewed(undefined); form.clearErrors('root'); }
  function accept(values: WeatherReviewInput) { const parsed = weatherReviewSchema.safeParse(values); if (!parsed.success) { for (const issue of parsed.error.issues) { const name = issue.path[0] as keyof WeatherReviewInput; if (name) form.setError(name, { message: issue.message }); } return; } setReviewed(reviewWeather(stateId, values, provenance)); }
  const requestError = snapshot.error ? toUserFacingError(snapshot.error) : undefined;
  return <SectionCard title="Weather review"><Text>FastAPI retrieves Open-Meteo weather using this session’s authoritative coordinates. Review every value before accepting it as an unsaved input.</Text>
    <Controller control={form.control} name="target_date" render={({ field, fieldState }) => <FormField label="Target date (YYYY-MM-DD)" value={field.value} onBlur={field.onBlur} onChangeText={(value) => edit('target_date', value, field.onChange)} error={fieldState.error?.message} keyboardType="numbers-and-punctuation" />} />
    <PrimaryButton disabled={snapshot.isFetching} onPress={() => void retrieve()}>{snapshot.isFetching ? 'Retrieving weather…' : 'Retrieve weather'}</PrimaryButton>
    {requestError ? <ErrorState title="Weather unavailable" description={requestError.description} onRetry={() => void retrieve()} technicalDetails={requestError.technicalDetails} /> : null}
    {fields.map(([name, label]) => <Controller key={name} control={form.control} name={name} render={({ field, fieldState }) => <FormField label={label} value={field.value ?? ''} onBlur={field.onBlur} onChangeText={(value) => edit(name, value, field.onChange)} error={fieldState.error?.message} keyboardType="numbers-and-punctuation" inputMode="decimal" />} />)}
    <PrimaryButton onPress={form.handleSubmit(accept)}>Accept reviewed weather</PrimaryButton>
    {snapshot.data && provenance === 'fetched_reviewed' ? <SectionCard title="Open-Meteo source"><MetricRow label="Source timezone" value={snapshot.data.source_timezone} /><MetricRow label="Coordinates" value={`${snapshot.data.latitude}, ${snapshot.data.longitude}`} /><MetricRow label="Wind heights" value={`${snapshot.data.wind_source_height_m} m → ${snapshot.data.wind_normalized_height_m} m`} /><TechnicalDetails details={{ fetched_at: snapshot.data.fetched_at, state_id: snapshot.data.state_id, target_date: snapshot.data.target_date }} /></SectionCard> : null}
    {reviewed ? <SectionCard title="Reviewed weather input"><MetricRow label="Date" value={reviewed.targetDate} /><MetricRow label="Provenance" value={reviewed.provenance === 'manual' ? 'Fully manual' : 'Fetched and reviewed'} /><Text>Prepared locally for later deterministic water computation. Not submitted yet.</Text></SectionCard> : <EmptyState title="Weather not accepted" description="Failed retrieval never becomes a zero-filled result." />}
  </SectionCard>;
}

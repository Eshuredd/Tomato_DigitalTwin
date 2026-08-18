import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Text } from 'react-native';
import { ChoiceField, EmptyState, ErrorState, FormField, MetricRow, PrimaryButton, SectionCard, TechnicalDetails } from '@/components/ui';
import { localDateTimeForDate, localDateTimeInput } from '@/lib/dates/local-date';
import { reviewIrrigation, type IrrigationDraft, type IrrigationMode, type ReviewedIrrigation } from './drafts';

const defaults = (targetDate?: string): IrrigationDraft => ({ mode: 'none', timestamp: targetDate ? localDateTimeForDate(targetDate) : localDateTimeInput(), directDepth: '', totalLitres: '', litresArea: '', emitterCount: '', emitterFlow: '', runtimeMinutes: '', dripArea: '' });
export function IrrigationWorkflow({ stateId, targetDate, onAcceptedChange }: { stateId: string; targetDate?: string; onAcceptedChange?: (value: ReviewedIrrigation | undefined) => void }) {
  const form = useForm<IrrigationDraft>({ defaultValues: defaults(targetDate) }); const mode = useWatch({ control: form.control, name: 'mode' }); const [reviewed, setReviewed] = useState<ReviewedIrrigation>(); const [error, setError] = useState<string>();
  function change(name: keyof IrrigationDraft, value: string) { form.setValue(name, value as never); setReviewed(undefined); onAcceptedChange?.(undefined); setError(undefined); }
  function accept(values: IrrigationDraft) { try { const next = reviewIrrigation(stateId, values); setReviewed(next); onAcceptedChange?.(next); setError(undefined); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Irrigation input is invalid.'); } }
  const input = (name: keyof IrrigationDraft, label: string, decimal = true) => <Controller control={form.control} name={name} render={({ field }) => <FormField label={label} value={String(field.value)} onBlur={field.onBlur} onChangeText={(value) => change(name, value)} keyboardType="numbers-and-punctuation" {...(decimal ? { inputMode: 'decimal' as const } : {})} />} />;
  return <SectionCard title="Irrigation input review"><Text>Prepare the exact recent-irrigation input for a later water-state request. Nothing on this card is persisted to FastAPI.</Text><ChoiceField label="Input mode" value={mode} options={['none', 'direct', 'litres_area', 'drip_runtime']} onChange={(value) => change('mode', value as IrrigationMode)} />
    {mode !== 'none' ? input('timestamp', 'Event date and time (YYYY-MM-DDTHH:MM, local)', false) : null}
    {mode === 'direct' ? input('directDepth', 'Irrigation depth (mm)') : null}
    {mode === 'litres_area' ? <>{input('totalLitres', 'Total water applied (litres)')}{input('litresArea', 'Irrigated area (m²)')}</> : null}
    {mode === 'drip_runtime' ? <>{input('emitterCount', 'Emitter count')}{input('emitterFlow', 'Emitter flow (litres/hour)')}{input('runtimeMinutes', 'Runtime (minutes)')}{input('dripArea', 'Irrigated area (m²)')}</> : null}
    {error ? <ErrorState title="Irrigation input is invalid" description={error} /> : null}<PrimaryButton onPress={form.handleSubmit(accept)}>Accept irrigation input</PrimaryButton>
    {reviewed ? <SectionCard title="Reviewed irrigation draft"><MetricRow label="Status" value={reviewed.distinction.replaceAll('_', ' ')} />{reviewed.event ? <><MetricRow label="Calculated depth" value={`${reviewed.event.amount_mm.toFixed(6)} mm`} /><MetricRow label="Source" value={reviewed.event.source} /><MetricRow label="Aware timestamp" value={reviewed.event.timestamp} /></> : <MetricRow label="Recent irrigation" value="None" />}<TechnicalDetails details={reviewed.details} /><Text>Unsaved route-scoped draft only. No irrigation record or deterministic water state exists yet.</Text></SectionCard> : <EmptyState title="Irrigation not accepted" description="Choose a mode and review valid input. Explicit zero remains distinct from no irrigation." />}
  </SectionCard>;
}

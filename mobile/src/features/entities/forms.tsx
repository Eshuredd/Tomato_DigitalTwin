import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm, type FieldErrors } from 'react-hook-form';
import { Text } from 'react-native';
import { z } from 'zod';

import { AppHeader, AppScreen, ChoiceField, ErrorState, FormField, FormScreen, PrimaryButton, SectionCard } from '@/components/ui';
import { localCalendarDate } from '@/lib/dates/local-date';
import { buildPlotPayload, buildSessionPayload, cropCycleFormSchema, farmFormSchema, plotFormSchema, sessionFormSchema, stateIdSchema } from '@/lib/forms/fields';
import { getSession, queryKeys, soilTextures, toUserFacingError } from '@/lib/api';
import { queryClient } from '@/lib/query/client';
import { useCreateCropCycle, useCreateFarm, useCreatePlot, useCreateSession } from './hooks';

type LocationValues = Pick<z.input<typeof plotFormSchema>, 'location_name' | 'latitude' | 'longitude' | 'elevation' | 'soil_texture'>;
type LocationProps = { values: LocationValues; errors: FieldErrors<LocationValues>; set: (name: keyof LocationValues, value: string) => void };

function LocationFields({ values, errors, set }: LocationProps) {
  return <>
    <FormField label="Location name" value={values.location_name} onChangeText={(value) => set('location_name', value)} error={errors.location_name?.message as string} autoCapitalize="words" />
    <FormField label="Latitude" value={values.latitude} onChangeText={(value) => set('latitude', value)} error={errors.latitude?.message as string} keyboardType="numbers-and-punctuation" inputMode="decimal" />
    <FormField label="Longitude" value={values.longitude} onChangeText={(value) => set('longitude', value)} error={errors.longitude?.message as string} keyboardType="numbers-and-punctuation" inputMode="decimal" />
    <FormField label="Elevation in metres (optional)" value={values.elevation ?? ''} onChangeText={(value) => set('elevation', value)} error={errors.elevation?.message as string} keyboardType="numbers-and-punctuation" inputMode="decimal" />
    <ChoiceField label="Soil texture" value={values.soil_texture} options={soilTextures} onChange={(value) => set('soil_texture', value)} />
  </>;
}

function MutationError({ error }: { error: unknown }) {
  if (!error) return null;
  const value = toUserFacingError(error);
  return <ErrorState title={value.title} description={value.description} technicalDetails={value.technicalDetails} />;
}

export function CreateFarmScreen() {
  const router = useRouter(); const mutation = useCreateFarm();
  const form = useForm({ resolver: zodResolver(farmFormSchema), defaultValues: { name: '' } });
  return <FormScreen><AppScreen keyboardShouldPersistTaps="handled"><AppHeader eyebrow="New place" title="Create farm" description="Add an authoritative farm record." /><SectionCard>
    <Controller control={form.control} name="name" render={({ field, fieldState }) => <FormField label="Farm name" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={fieldState.error?.message} autoCapitalize="words" />} />
    <MutationError error={mutation.error} /><PrimaryButton disabled={mutation.isPending} onPress={form.handleSubmit((input) => mutation.mutate(input, { onSuccess: (farm) => router.replace({ pathname: '/farms/[farmId]', params: { farmId: farm.farm_id } }) }))}>{mutation.isPending ? 'Creating…' : 'Create farm'}</PrimaryButton>
  </SectionCard></AppScreen></FormScreen>;
}

export function CreatePlotScreen({ farmId }: { farmId: string }) {
  const router = useRouter(); const mutation = useCreatePlot(farmId);
  const form = useForm({ resolver: zodResolver(plotFormSchema), defaultValues: { name: '', location_name: '', latitude: '', longitude: '', elevation: '', soil_texture: 'loam' as const } });
  // React Hook Form intentionally owns this subscription; passing the values to plain fields cannot create stale memoized state.
  // eslint-disable-next-line react-hooks/incompatible-library
  const locationValues = form.watch();
  return <FormScreen><AppScreen keyboardShouldPersistTaps="handled"><AppHeader eyebrow="New plot" title="Create plot" description="Coordinates and soil context are stored by FastAPI." /><SectionCard>
    <Controller control={form.control} name="name" render={({ field, fieldState }) => <FormField label="Plot name" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={fieldState.error?.message} autoCapitalize="words" />} />
    <LocationFields values={locationValues} errors={form.formState.errors} set={(name, value) => form.setValue(name, value as never, { shouldValidate: true })} /><MutationError error={mutation.error} />
    <PrimaryButton disabled={mutation.isPending} onPress={form.handleSubmit((value) => mutation.mutate(buildPlotPayload(value), { onSuccess: (plot) => router.replace({ pathname: '/plots/[plotId]', params: { plotId: plot.plot_id } }) }))}>{mutation.isPending ? 'Creating…' : 'Create plot'}</PrimaryButton>
  </SectionCard></AppScreen></FormScreen>;
}

export function CreateSessionScreen() {
  const router = useRouter(); const mutation = useCreateSession();
  const form = useForm({ resolver: zodResolver(sessionFormSchema), defaultValues: { planting_date: localCalendarDate(), location_name: '', latitude: '', longitude: '', elevation: '', soil_texture: 'loam' as const } });
  // React Hook Form intentionally owns this subscription; passing the values to plain fields cannot create stale memoized state.
  // eslint-disable-next-line react-hooks/incompatible-library
  const locationValues = form.watch();
  return <FormScreen><AppScreen keyboardShouldPersistTaps="handled"><AppHeader eyebrow="Standalone" title="Create session" description="Create a tomato session without assigning a farm or plot relationship." /><SectionCard>
    <Controller control={form.control} name="planting_date" render={({ field, fieldState }) => <FormField label="Planting date (YYYY-MM-DD)" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={fieldState.error?.message} keyboardType="numbers-and-punctuation" />} />
    <LocationFields values={locationValues} errors={form.formState.errors} set={(name, value) => form.setValue(name, value as never, { shouldValidate: true })} /><MutationError error={mutation.error} />
    <PrimaryButton disabled={mutation.isPending} onPress={form.handleSubmit((value) => mutation.mutate(buildSessionPayload(value), { onSuccess: (session) => router.replace({ pathname: '/cycle/[stateId]', params: { stateId: session.state_id } }) }))}>{mutation.isPending ? 'Creating…' : 'Create standalone session'}</PrimaryButton>
  </SectionCard></AppScreen></FormScreen>;
}

export function CreateCropCycleScreen({ plotId }: { plotId: string }) {
  const router = useRouter(); const mutation = useCreateCropCycle(plotId);
  const form = useForm({ resolver: zodResolver(cropCycleFormSchema), defaultValues: { planting_date: localCalendarDate() } });
  return <FormScreen><AppScreen keyboardShouldPersistTaps="handled"><AppHeader eyebrow="Tomato cycle" title="Create crop cycle" description="FastAPI inherits location and soil from the authoritative plot." /><SectionCard><Text>Crop: Tomato</Text>
    <Controller control={form.control} name="planting_date" render={({ field, fieldState }) => <FormField label="Planting date (YYYY-MM-DD)" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={fieldState.error?.message} keyboardType="numbers-and-punctuation" />} />
    <MutationError error={mutation.error} /><PrimaryButton disabled={mutation.isPending} onPress={form.handleSubmit((value) => mutation.mutate({ crop_type: 'tomato', planting_date: value.planting_date }, { onSuccess: (session) => router.replace({ pathname: '/cycle/[stateId]', params: { stateId: session.state_id, originPlot: plotId } }) }))}>{mutation.isPending ? 'Creating…' : 'Create tomato cycle'}</PrimaryButton>
  </SectionCard></AppScreen></FormScreen>;
}

export function LoadSessionForm() {
  const router = useRouter(); const schema = z.object({ state_id: stateIdSchema });
  const [loadError, setLoadError] = useState<unknown>();
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { state_id: '' } });
  const submit = form.handleSubmit(async ({ state_id }) => {
    const id = state_id.trim();
    setLoadError(undefined);
    try { const session = await getSession(id); queryClient.setQueryData(queryKeys.session(id), session); router.push({ pathname: '/cycle/[stateId]', params: { stateId: id } }); }
    catch (error) { setLoadError(error); }
  });
  return <SectionCard title="Open existing session"><Controller control={form.control} name="state_id" render={({ field }) => <FormField label="State ID" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={form.formState.errors.state_id?.message} autoCapitalize="none" autoCorrect={false} />} /><PrimaryButton disabled={form.formState.isSubmitting} onPress={submit}>{form.formState.isSubmitting ? 'Loading…' : 'Open session'}</PrimaryButton><MutationError error={loadError} /></SectionCard>;
}

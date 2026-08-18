import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Text } from 'react-native';
import { AppHeader, AppScreen, EmptyState, ErrorState, FormField, FormScreen, LoadingState, PrimaryButton, SectionCard, TechnicalDetails } from '@/components/ui';
import { ResourceError } from '@/features/entities/presentation';
import { useSession } from '@/features/entities/hooks';
import { normalizeStateId } from '@/lib/forms/fields';
import { DiseaseWorkflow } from './disease';
import { IrrigationWorkflow } from './irrigation';
import { WeatherWorkflow } from './weather';
import type { ReviewedIrrigation, ReviewedWeather } from './drafts';
import { useTwinState, useWaterState } from './hooks';
import { WorkflowRequestIdentityStore } from './requests';
import { WaterWorkflow } from './water';
import { TwinWorkflow } from './twin';
import { AdvancementWorkflow } from './advancement';

export function WorkflowEntry() {
  const router = useRouter(); const [stateId, setStateId] = useState(''); const [error, setError] = useState<string>();
  function open() { try { const id = normalizeStateId(stateId); setError(undefined); router.push({ pathname: '/workflow/[stateId]', params: { stateId: id } }); } catch { setError('State ID is required.'); } }
  return <FormScreen><AppScreen testID="screen-workflow" keyboardShouldPersistTaps="handled"><AppHeader eyebrow="Daily review" title="Workflow" description="Open an authoritative session before preparing evidence and inputs." /><SectionCard title="Authoritative session"><FormField label="State ID" value={stateId} onChangeText={setStateId} autoCapitalize="none" autoCorrect={false} error={error} /><PrimaryButton onPress={open}>Open workflow</PrimaryButton></SectionCard><SectionCard title="Need a session?"><Text>Create a standalone session or load one from the Cycle tab.</Text><PrimaryButton onPress={() => router.push('/cycle')}>Open Cycle</PrimaryButton></SectionCard></AppScreen></FormScreen>;
}

export function SessionWorkflow({ stateId }: { stateId: string }) {
  const session = useSession(stateId);
  return <FormScreen><AppScreen testID="screen-session-workflow" keyboardShouldPersistTaps="handled"><AppHeader eyebrow="Session workflow" title="Evidence and deterministic state" description="Review inputs, compute authoritative water state, canonicalize the twin, and explicitly advance one day." />
    {session.isPending ? <LoadingState label="Loading authoritative session" /> : session.error ? <ResourceError error={session.error} retry={session.refetch} /> : session.data ? <WorkflowStages stateId={stateId} plantingDate={session.data.planting_date} /> : <ErrorState description="No authoritative session was returned." />}
  </AppScreen></FormScreen>;
}

function WorkflowStages({ stateId, plantingDate }: { stateId: string; plantingDate: string }) {
  const [weather, setWeather] = useState<ReviewedWeather>(); const [irrigation, setIrrigation] = useState<ReviewedIrrigation>(); const [identities] = useState(() => new WorkflowRequestIdentityStore(stateId)); const water = useWaterState(stateId).data; const twin = useTwinState(stateId).data;
  function acceptWeather(next: ReviewedWeather | undefined) { setWeather(next); setIrrigation(undefined); }
  return <><SectionCard title="Session identity"><Text>Crop: Tomato</Text><Text>Planting date: {plantingDate}</Text><TechnicalDetails details={{ state_id: stateId }} /></SectionCard><DiseaseWorkflow stateId={stateId} /><WeatherWorkflow stateId={stateId} onAcceptedChange={acceptWeather} /><IrrigationWorkflow key={`water-irrigation-${weather?.targetDate ?? 'unbound'}`} stateId={stateId} targetDate={weather?.targetDate} onAcceptedChange={setIrrigation} />{weather && irrigation ? <WaterWorkflow stateId={stateId} weather={weather} irrigation={irrigation} current={water} identities={identities} /> : <SectionCard title="Deterministic water state" accent="agronomy"><EmptyState title="Reviewed inputs required" description="Accept weather and irrigation for this session before computing water state." /></SectionCard>}{water ? <TwinWorkflow stateId={stateId} current={twin} /> : null}{water && twin ? <AdvancementWorkflow stateId={stateId} water={water} twin={twin} identities={identities} /> : null}</>;
}

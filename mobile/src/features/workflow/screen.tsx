import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Text } from 'react-native';
import { AppHeader, AppScreen, ErrorState, FormField, FormScreen, LoadingState, PrimaryButton, SectionCard, TechnicalDetails } from '@/components/ui';
import { ResourceError } from '@/features/entities/presentation';
import { useSession } from '@/features/entities/hooks';
import { normalizeStateId } from '@/lib/forms/fields';
import { DiseaseWorkflow } from './disease';
import { IrrigationWorkflow } from './irrigation';
import { WeatherWorkflow } from './weather';

export function WorkflowEntry() {
  const router = useRouter(); const [stateId, setStateId] = useState(''); const [error, setError] = useState<string>();
  function open() { try { const id = normalizeStateId(stateId); setError(undefined); router.push({ pathname: '/workflow/[stateId]', params: { stateId: id } }); } catch { setError('State ID is required.'); } }
  return <FormScreen><AppScreen testID="screen-workflow" keyboardShouldPersistTaps="handled"><AppHeader eyebrow="Daily review" title="Workflow" description="Open an authoritative session before preparing evidence and inputs." /><SectionCard title="Authoritative session"><FormField label="State ID" value={stateId} onChangeText={setStateId} autoCapitalize="none" autoCorrect={false} error={error} /><PrimaryButton onPress={open}>Open workflow</PrimaryButton></SectionCard><SectionCard title="Need a session?"><Text>Create a standalone session or load one from the Cycle tab.</Text><PrimaryButton onPress={() => router.push('/cycle')}>Open Cycle</PrimaryButton></SectionCard></AppScreen></FormScreen>;
}

export function SessionWorkflow({ stateId }: { stateId: string }) {
  const session = useSession(stateId);
  return <FormScreen><AppScreen testID="screen-session-workflow" keyboardShouldPersistTaps="handled"><AppHeader eyebrow="Session workflow" title="Evidence and inputs" description="Disease, weather, and irrigation are scoped to the authoritative state ID below." />
    {session.isPending ? <LoadingState label="Loading authoritative session" /> : session.error ? <ResourceError error={session.error} retry={session.refetch} /> : session.data ? <><SectionCard title="Session identity"><Text>Crop: Tomato</Text><Text>Planting date: {session.data.planting_date}</Text><TechnicalDetails details={{ state_id: session.data.state_id }} /></SectionCard><DiseaseWorkflow stateId={stateId} /><WeatherWorkflow stateId={stateId} /><IrrigationWorkflow stateId={stateId} /></> : <ErrorState description="No authoritative session was returned." />}
  </AppScreen></FormScreen>;
}

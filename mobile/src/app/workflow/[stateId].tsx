import { useLocalSearchParams } from 'expo-router';
import { SessionWorkflow } from '@/features/workflow/screen';
export default function WorkflowRoute() { const { stateId = '' } = useLocalSearchParams<{ stateId: string }>(); return <SessionWorkflow key={stateId} stateId={stateId} />; }

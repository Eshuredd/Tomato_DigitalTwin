import { useLocalSearchParams } from 'expo-router';
import { CreatePlotScreen } from '@/features/entities/forms';
export default function CreatePlotRoute() { const { farmId = '' } = useLocalSearchParams<{ farmId: string }>(); return <CreatePlotScreen farmId={farmId} />; }

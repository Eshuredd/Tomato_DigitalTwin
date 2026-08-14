import { useLocalSearchParams } from 'expo-router';
import { CreateCropCycleScreen } from '@/features/entities/forms';
export default function CreateCycleRoute() { const { plotId = '' } = useLocalSearchParams<{ plotId: string }>(); return <CreateCropCycleScreen plotId={plotId} />; }

import { AppHeader, AppScreen, PrimaryButton, SectionCard } from '@/components/ui';
import { LoadSessionForm } from '@/features/entities/forms';
import { useRouter } from 'expo-router';
export default function CycleScreen() { const router = useRouter(); return <AppScreen testID="screen-cycle" keyboardShouldPersistTaps="handled"><AppHeader eyebrow="Crop cycle" title="Cycle" description="Create a standalone tomato session or open an existing authoritative state." /><SectionCard title="New standalone session"><PrimaryButton testID="create-session" onPress={() => router.push('/cycle/create')}>Create standalone session</PrimaryButton></SectionCard><LoadSessionForm /></AppScreen>; }

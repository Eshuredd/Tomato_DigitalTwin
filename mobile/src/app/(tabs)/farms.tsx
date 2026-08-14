import { FarmListView } from '@/features/entities/presentation';
import { useFarms } from '@/features/entities/hooks';
export default function FarmsScreen() { const query = useFarms(); return <FarmListView farms={query.data} pending={query.isPending} error={query.error} refreshing={query.isFetching} refresh={query.refetch} />; }

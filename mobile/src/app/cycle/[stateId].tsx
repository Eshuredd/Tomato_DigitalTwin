import { useLocalSearchParams } from 'expo-router';
import { AppHeader, AppScreen, LoadingState } from '@/components/ui';
import { ResourceError, SessionSummaryCard } from '@/features/entities/presentation';
import { useSession } from '@/features/entities/hooks';
export default function ActiveCycle() { const { stateId = '', originPlot } = useLocalSearchParams<{ stateId: string; originPlot?: string }>(); const query = useSession(stateId); return <AppScreen testID="screen-active-cycle"><AppHeader eyebrow="Authoritative session" title="Active cycle" description="Server-derived crop and location context." />{query.isPending ? <LoadingState label="Loading session" /> : query.error ? <ResourceError error={query.error} retry={query.refetch} /> : query.data ? <SessionSummaryCard session={query.data} provenance={originPlot ? `Opened after creating a cycle from plot ${originPlot}.` : undefined} /> : null}</AppScreen>; }

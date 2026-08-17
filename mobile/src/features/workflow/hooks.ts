import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSystemInfo, getWeatherSnapshot, predictDisease, queryKeys, type DiseasePrediction, type PredictDiseaseInput } from '@/lib/api';

export interface CachedDiseaseEvidence { response: DiseasePrediction; modelVersion: string }

export function useSystemInfo() { return useQuery({ queryKey: queryKeys.systemInfo(), queryFn: ({ signal }) => getSystemInfo(signal), staleTime: 5 * 60_000 }); }
export function useDiseaseEvidence(stateId: string) { return useQuery<CachedDiseaseEvidence>({ queryKey: queryKeys.diseaseEvidence(stateId), queryFn: async () => { throw new Error('Disease evidence has no retrieval endpoint.'); }, enabled: false, staleTime: Infinity }); }
export function usePredictDisease(stateId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ input, signal }: { input: PredictDiseaseInput; signal?: AbortSignal }) => predictDisease(stateId, input, signal),
    retry: false,
    onSuccess: (response, variables) => client.setQueryData<CachedDiseaseEvidence>(queryKeys.diseaseEvidence(stateId), { response, modelVersion: variables.input.model_version }),
  });
}
export function useClearDiseaseEvidence(stateId: string) { const client = useQueryClient(); return () => client.removeQueries({ queryKey: queryKeys.diseaseEvidence(stateId), exact: true }); }
export function useWeatherSnapshot(stateId: string, targetDate: string) {
  return useQuery({ queryKey: queryKeys.weatherSnapshot(stateId, targetDate), queryFn: ({ signal }) => getWeatherSnapshot(stateId, targetDate, signal), enabled: false, retry: false, staleTime: 5 * 60_000 });
}

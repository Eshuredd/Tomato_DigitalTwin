import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { advanceOneDay, computeWaterState, getSystemInfo, getWeatherSnapshot, predictDisease, queryKeys, updateTwinState, type AdvanceOneDayRequest, type AdvanceOneDayResponse, type ComputeWaterStateRequest, type DiseasePrediction, type PredictDiseaseInput, type UpdateTwinStateResponse, type WaterStateResponse } from '@/lib/api';

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
export function useWaterState(stateId: string) { return useQuery<WaterStateResponse>({ queryKey: queryKeys.waterState(stateId), queryFn: async () => { throw new Error('Water state has no retrieval endpoint.'); }, enabled: false, staleTime: Infinity }); }
export function useTwinState(stateId: string) { return useQuery<UpdateTwinStateResponse>({ queryKey: queryKeys.twinState(stateId), queryFn: async () => { throw new Error('Twin update result has no dedicated retrieval endpoint.'); }, enabled: false, staleTime: Infinity }); }
export function useComputeWaterState(stateId: string) {
  const client = useQueryClient();
  return useMutation({ mutationFn: ({ input, signal }: { input: ComputeWaterStateRequest; signal?: AbortSignal }) => computeWaterState(stateId, input, signal), retry: false, onSuccess: (response) => client.setQueryData(queryKeys.waterState(stateId), response) });
}
export function useUpdateTwinState(stateId: string) {
  const client = useQueryClient();
  return useMutation({ mutationFn: ({ signal }: { signal?: AbortSignal } = {}) => updateTwinState(stateId, signal), retry: false, onSuccess: (response) => { client.setQueryData(queryKeys.twinState(stateId), response); void client.invalidateQueries({ queryKey: queryKeys.session(stateId), exact: true }); } });
}
export function useAdvanceOneDay(stateId: string) {
  return useMutation<AdvanceOneDayResponse, Error, { input: AdvanceOneDayRequest; signal?: AbortSignal }>({ mutationFn: ({ input, signal }) => advanceOneDay(stateId, input, signal), retry: false });
}

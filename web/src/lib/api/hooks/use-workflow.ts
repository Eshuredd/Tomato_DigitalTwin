"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdvanceOneDayRequest, ComputeWaterStateRequest, DiseasePrediction, PredictDiseaseInput } from "../contracts";
import { advanceOneDay, computeWaterState, getWeatherSnapshot, predictDisease, updateTwinState } from "../operations";
import { queryKeys } from "../query-keys";

export interface CachedDiseaseEvidence {
  response: DiseasePrediction;
  fileSignature: string;
  modelVersion: string;
}

export function useDiseaseEvidence(stateId: string) {
  const client = useQueryClient();
  return client.getQueryData<CachedDiseaseEvidence>(queryKeys.diseaseEvidence(stateId));
}

export function usePredictDisease() {
  return useMutation({
    mutationFn: ({ stateId, input, signal }: { stateId: string; input: PredictDiseaseInput; signal: AbortSignal }) =>
      predictDisease(stateId, input, signal),
    retry: false,
  });
}

export function useWeatherSnapshot(stateId: string, targetDate: string) {
  const client = useQueryClient();
  const queryKey = queryKeys.weatherSnapshot(stateId, targetDate);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => getWeatherSnapshot(stateId, targetDate, signal),
    enabled: false,
    retry: false,
    staleTime: 5 * 60_000,
  });
  return { ...query, cancel: () => client.cancelQueries({ queryKey, exact: true }) };
}

export function useComputeWaterState() { return useMutation({ mutationFn: ({ stateId, input, signal }: { stateId: string; input: ComputeWaterStateRequest; signal: AbortSignal }) => computeWaterState(stateId, input, signal), retry: false }); }
export function useUpdateTwinState() { return useMutation({ mutationFn: ({ stateId, signal }: { stateId: string; signal: AbortSignal }) => updateTwinState(stateId, signal), retry: false }); }
export function useAdvanceOneDay() { return useMutation({ mutationFn: ({ stateId, input, signal }: { stateId: string; input: AdvanceOneDayRequest; signal: AbortSignal }) => advanceOneDay(stateId, input, signal), retry: false }); }

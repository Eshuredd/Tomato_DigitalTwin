"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateFarmInput } from "../contracts";
import { createFarm, getFarm, getFarms } from "../operations";
import { queryKeys } from "../query-keys";
export function useFarms() { return useQuery({ queryKey: queryKeys.farms(), queryFn: ({ signal }) => getFarms(signal) }); }
export function useFarm(farmId: string) { return useQuery({ queryKey: queryKeys.farm(farmId), queryFn: ({ signal }) => getFarm(farmId, signal), enabled: Boolean(farmId) }); }
export function useCreateFarm() {
  const client = useQueryClient();
  return useMutation({ mutationFn: (input: CreateFarmInput) => createFarm(input), retry: false, onSuccess: (farm) => {
    client.setQueryData(queryKeys.farm(farm.farm_id), farm);
    void client.invalidateQueries({ queryKey: queryKeys.farms(), exact: true });
  } });
}

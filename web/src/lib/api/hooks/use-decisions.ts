"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ActualActionCreateRequest, SimulateActionsRequest } from "../contracts";
import { createActualAction, getActualActions, getHistory, narrate, recommend, simulateActions } from "../operations";
import { queryKeys } from "../query-keys";

export function useSimulateActions() { return useMutation({ mutationFn: ({ stateId, input, signal }: { stateId: string; input: SimulateActionsRequest; signal: AbortSignal }) => simulateActions(stateId, input, signal), retry: false }); }
export function useRecommend() { return useMutation({ mutationFn: ({ stateId, signal }: { stateId: string; signal: AbortSignal }) => recommend(stateId, signal), retry: false }); }
export function useNarrate() { return useMutation({ mutationFn: ({ stateId, signal }: { stateId: string; signal: AbortSignal }) => narrate(stateId, signal), retry: false }); }
export function useHistory(stateId: string) { return useQuery({ queryKey: queryKeys.history(stateId), queryFn: ({ signal }) => getHistory(stateId, signal), enabled: Boolean(stateId), retry: false }); }
export function useActualActions(stateId: string, limit: number) { return useQuery({ queryKey: queryKeys.actualActions(stateId, limit), queryFn: ({ signal }) => getActualActions(stateId, limit, signal), enabled: Boolean(stateId), retry: false }); }
export function useCreateActualAction(stateId: string) { const client = useQueryClient(); return useMutation({ mutationFn: ({ input, signal }: { input: ActualActionCreateRequest; signal: AbortSignal }) => createActualAction(stateId, input, signal), retry: false, onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.actualActionsRoot(stateId) }) }); }

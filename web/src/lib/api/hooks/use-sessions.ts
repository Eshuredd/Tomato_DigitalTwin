"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateCropCycleInput, CreateSessionInput, SessionSummary } from "../contracts";
import { createCropCycle, createSession, getSession } from "../operations";
import { queryKeys } from "../query-keys";
export function useSession(stateId: string) { return useQuery<SessionSummary>({ queryKey: queryKeys.session(stateId), queryFn: ({ signal }) => getSession(stateId, signal), enabled: Boolean(stateId), retry: false }); }
export function useCreateSession() {
  const client = useQueryClient();
  return useMutation({ mutationFn: (input: CreateSessionInput) => createSession(input), retry: false, onSuccess: (session) => client.setQueryData(queryKeys.session(session.state_id), session) });
}
export function useCreateCropCycle(plotId: string) {
  const client = useQueryClient();
  return useMutation({ mutationFn: (input: CreateCropCycleInput) => createCropCycle(plotId, input), retry: false, onSuccess: (session) => client.setQueryData(queryKeys.session(session.state_id), session) });
}

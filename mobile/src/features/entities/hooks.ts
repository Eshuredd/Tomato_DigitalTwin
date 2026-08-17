import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createCropCycle, createFarm, createPlot, createSession, getFarm, getFarms, getPlot, getPlots, getSession, queryKeys, type CreateCropCycleInput, type CreateFarmInput, type CreatePlotInput, type CreateSessionInput, type Farm, type Plot, type SessionSummary } from '@/lib/api';

export function seedFarmCreation(client: ReturnType<typeof useQueryClient>, farm: Farm) {
  client.setQueryData(queryKeys.farm(farm.farm_id), farm);
  const farms = client.getQueryData<Farm[]>(queryKeys.farms());
  if (farms !== undefined && !farms.some((item) => item.farm_id === farm.farm_id)) client.setQueryData(queryKeys.farms(), [...farms, farm]);
}
export function seedPlotCreation(client: ReturnType<typeof useQueryClient>, farmId: string, plot: Plot) {
  client.setQueryData(queryKeys.plot(plot.plot_id), plot);
  const plots = client.getQueryData<Plot[]>(queryKeys.farmPlots(farmId));
  if (plots !== undefined && !plots.some((item) => item.plot_id === plot.plot_id)) client.setQueryData(queryKeys.farmPlots(farmId), [...plots, plot]);
}
export function seedSessionCreation(client: ReturnType<typeof useQueryClient>, session: SessionSummary) { client.setQueryData(queryKeys.session(session.state_id), session); }

export const useFarms = () => useQuery({ queryKey: queryKeys.farms(), queryFn: ({ signal }) => getFarms(signal) });
export const useFarm = (farmId: string) => useQuery({ queryKey: queryKeys.farm(farmId), queryFn: ({ signal }) => getFarm(farmId, signal), enabled: Boolean(farmId), retry: false });
export const usePlots = (farmId: string) => useQuery({ queryKey: queryKeys.farmPlots(farmId), queryFn: ({ signal }) => getPlots(farmId, signal), enabled: Boolean(farmId) });
export const usePlot = (plotId: string) => useQuery({ queryKey: queryKeys.plot(plotId), queryFn: ({ signal }) => getPlot(plotId, signal), enabled: Boolean(plotId), retry: false });
export const useSession = (stateId: string) => useQuery<SessionSummary>({ queryKey: queryKeys.session(stateId), queryFn: ({ signal }) => getSession(stateId, signal), enabled: Boolean(stateId), retry: false, staleTime: Infinity });

export function useCreateFarm() { const client = useQueryClient(); return useMutation({ mutationFn: (input: CreateFarmInput) => createFarm(input), retry: false, onSuccess: (farm) => seedFarmCreation(client, farm) }); }
export function useCreatePlot(farmId: string) { const client = useQueryClient(); return useMutation({ mutationFn: (input: CreatePlotInput) => createPlot(farmId, input), retry: false, onSuccess: (plot) => seedPlotCreation(client, farmId, plot) }); }
export function useCreateSession() { const client = useQueryClient(); return useMutation({ mutationFn: (input: CreateSessionInput) => createSession(input), retry: false, onSuccess: (session) => seedSessionCreation(client, session) }); }
export function useCreateCropCycle(plotId: string) { const client = useQueryClient(); return useMutation({ mutationFn: (input: CreateCropCycleInput) => createCropCycle(plotId, input), retry: false, onSuccess: (session) => seedSessionCreation(client, session) }); }

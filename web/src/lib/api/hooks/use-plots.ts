"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreatePlotInput } from "../contracts";
import { createPlot, getPlot, getPlots } from "../operations";
import { queryKeys } from "../query-keys";
export function usePlots(farmId: string) { return useQuery({ queryKey: queryKeys.plots(farmId), queryFn: ({ signal }) => getPlots(farmId, signal), enabled: Boolean(farmId) }); }
export function usePlot(plotId: string) { return useQuery({ queryKey: queryKeys.plot(plotId), queryFn: ({ signal }) => getPlot(plotId, signal), enabled: Boolean(plotId) }); }
export function useCreatePlot(farmId: string) {
  const client = useQueryClient();
  return useMutation({ mutationFn: (input: CreatePlotInput) => createPlot(farmId, input), retry: false, onSuccess: (plot) => {
    client.setQueryData(queryKeys.plot(plot.plot_id), plot);
    void client.invalidateQueries({ queryKey: queryKeys.plots(farmId), exact: true });
  } });
}

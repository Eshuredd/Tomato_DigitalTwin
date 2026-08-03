export const queryKeys = {
  all: ["croptwin"] as const,
  health: () => [...queryKeys.all, "health"] as const,
  systemInfo: () => [...queryKeys.all, "system-info"] as const,
  farms: () => [...queryKeys.all, "farms"] as const,
  farm: (farmId: string) => [...queryKeys.farms(), farmId] as const,
  plots: (farmId: string) => [...queryKeys.farm(farmId), "plots"] as const,
  plot: (plotId: string) => [...queryKeys.all, "plots", plotId] as const,
  session: (stateId: string) => [...queryKeys.all, "sessions", stateId] as const,
  weatherSnapshot: (stateId: string, targetDate: string) => [...queryKeys.session(stateId), "weather", targetDate] as const,
  history: (stateId: string) => [...queryKeys.session(stateId), "history"] as const,
  actualActions: (stateId: string, limit: number) => [...queryKeys.session(stateId), "actual-actions", { limit }] as const,
} as const;

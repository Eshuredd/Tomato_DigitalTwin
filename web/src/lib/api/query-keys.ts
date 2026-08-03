export const queryKeys = {
  all: ["croptwin"] as const,
  health: () => [...queryKeys.all, "health"] as const,
  system: () => [...queryKeys.all, "system"] as const,
  farms: () => [...queryKeys.all, "farms"] as const,
  farm: (farmId: string) => [...queryKeys.farms(), farmId] as const,
  plots: (farmId: string) => [...queryKeys.farm(farmId), "plots"] as const,
  plot: (plotId: string) => [...queryKeys.all, "plots", plotId] as const,
  session: (stateId: string) => [...queryKeys.all, "sessions", stateId] as const,
  history: (stateId: string) => [...queryKeys.session(stateId), "history"] as const,
  actualActions: (stateId: string) => [...queryKeys.session(stateId), "actual-actions"] as const,
} as const;

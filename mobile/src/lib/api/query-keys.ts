export const queryKeys = {
  all: ['croptwin'] as const, health: () => [...queryKeys.all, 'health'] as const, systemInfo: () => [...queryKeys.all, 'system-info'] as const,
  farms: () => [...queryKeys.all, 'farms'] as const, farm: (farmId: string) => [...queryKeys.farms(), farmId] as const,
  farmPlots: (farmId: string) => [...queryKeys.farm(farmId), 'plots'] as const, plot: (plotId: string) => [...queryKeys.all, 'plots', plotId] as const,
  session: (stateId: string) => [...queryKeys.all, 'sessions', stateId] as const,
  diseaseEvidence: (stateId: string) => [...queryKeys.session(stateId), 'disease-evidence'] as const,
  weatherSnapshot: (stateId: string, date: string) => [...queryKeys.session(stateId), 'weather', date] as const,
  waterState: (stateId: string) => [...queryKeys.session(stateId), 'water-state'] as const, twinState: (stateId: string) => [...queryKeys.session(stateId), 'twin-state'] as const,
  advancement: (stateId: string, advancementId: string) => [...queryKeys.session(stateId), 'advancement', advancementId] as const,
  simulation: (stateId: string) => [...queryKeys.session(stateId), 'simulation'] as const, recommendation: (stateId: string) => [...queryKeys.session(stateId), 'recommendation'] as const,
  narration: (stateId: string) => [...queryKeys.session(stateId), 'narration'] as const, history: (stateId: string) => [...queryKeys.session(stateId), 'history'] as const,
  actualActionsRoot: (stateId: string) => [...queryKeys.session(stateId), 'actual-actions'] as const,
  actualActions: (stateId: string, limit: number) => [...queryKeys.actualActionsRoot(stateId), { limit }] as const,
} as const;

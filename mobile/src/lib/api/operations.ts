import { apiRequest } from './client';
import { createdSessionSchema, farmSchema, farmsSchema, healthSchema, loadedSessionSchema, plotSchema, plotsSchema, systemInfoSchema, type CreateCropCycleInput, type CreateFarmInput, type CreatePlotInput, type CreateSessionInput, type CreatedSession, type Farm, type Health, type LoadedSession, type Plot, type SystemInfo } from './contracts';
import { farmPath, plotPath, sessionPath } from './paths';
export function getHealth(signal?: AbortSignal): Promise<Health> { return apiRequest('/health', { signal, schema: healthSchema }); }
export function getSystemInfo(signal?: AbortSignal): Promise<SystemInfo> { return apiRequest('/system-info', { signal, schema: systemInfoSchema }); }
export const getFarms = (signal?: AbortSignal): Promise<Farm[]> => apiRequest('/farms', { signal, schema: farmsSchema });
export const getFarm = (farmId: string, signal?: AbortSignal): Promise<Farm> => apiRequest(farmPath(farmId), { signal, schema: farmSchema });
export const createFarm = (body: CreateFarmInput): Promise<Farm> => apiRequest('/farms', { method: 'POST', body, schema: farmSchema });
export const getPlots = (farmId: string, signal?: AbortSignal): Promise<Plot[]> => apiRequest(farmPath(farmId, 'plots'), { signal, schema: plotsSchema });
export const getPlot = (plotId: string, signal?: AbortSignal): Promise<Plot> => apiRequest(plotPath(plotId), { signal, schema: plotSchema });
export const createPlot = (farmId: string, body: CreatePlotInput): Promise<Plot> => apiRequest(farmPath(farmId, 'plots'), { method: 'POST', body, schema: plotSchema });
export const createSession = (body: CreateSessionInput): Promise<CreatedSession> => apiRequest('/sessions', { method: 'POST', body, schema: createdSessionSchema });
export const getSession = (stateId: string, signal?: AbortSignal): Promise<LoadedSession> => apiRequest(sessionPath(stateId), { signal, schema: loadedSessionSchema });
export const createCropCycle = (plotId: string, body: CreateCropCycleInput): Promise<CreatedSession> => apiRequest(plotPath(plotId, 'crop-cycles'), { method: 'POST', body, schema: createdSessionSchema });

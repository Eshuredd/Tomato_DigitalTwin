import { apiRequest } from "./client";
import { farmPath, plotPath, sessionPath } from "./paths";
import {
  createdSessionSchema, farmSchema, farmsSchema, healthSchema, loadedSessionSchema, plotSchema, plotsSchema, systemInfoSchema,
  type CreateCropCycleInput, type CreateFarmInput, type CreatePlotInput, type CreateSessionInput,
} from "./contracts";

export const getHealth = (signal?: AbortSignal) => apiRequest("/health", { signal, schema: healthSchema });
export const getSystemInfo = (signal?: AbortSignal) => apiRequest("/system-info", { signal, schema: systemInfoSchema });
export const getFarms = (signal?: AbortSignal) => apiRequest("/farms", { signal, schema: farmsSchema });
export const getFarm = (farmId: string, signal?: AbortSignal) => apiRequest(farmPath(farmId), { signal, schema: farmSchema });
export const createFarm = (body: CreateFarmInput) => apiRequest("/farms", { method: "POST", body, schema: farmSchema });
export const getPlots = (farmId: string, signal?: AbortSignal) => apiRequest(farmPath(farmId, "plots"), { signal, schema: plotsSchema });
export const getPlot = (plotId: string, signal?: AbortSignal) => apiRequest(plotPath(plotId), { signal, schema: plotSchema });
export const createPlot = (farmId: string, body: CreatePlotInput) => apiRequest(farmPath(farmId, "plots"), { method: "POST", body, schema: plotSchema });
export const createSession = (body: CreateSessionInput) => apiRequest("/sessions", { method: "POST", body, schema: createdSessionSchema });
export const getSession = (stateId: string, signal?: AbortSignal) => apiRequest(sessionPath(stateId), { signal, schema: loadedSessionSchema });
export const createCropCycle = (plotId: string, body: CreateCropCycleInput) => apiRequest(plotPath(plotId, "crop-cycles"), { method: "POST", body, schema: createdSessionSchema });

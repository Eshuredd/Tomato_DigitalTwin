import { apiRequest } from "./client";
import { CropTwinApiError } from "./errors";
import { farmPath, plotPath, sessionPath } from "./paths";
import {
  advanceOneDaySchema, createdSessionSchema, diseasePredictionSchema, farmSchema, farmsSchema, healthSchema, loadedSessionSchema, plotSchema, plotsSchema, systemInfoSchema, updateTwinStateSchema, waterStateSchema, weatherSnapshotSchema,
  type AdvanceOneDayRequest, type ComputeWaterStateRequest, type CreateCropCycleInput, type CreateFarmInput, type CreatePlotInput, type CreateSessionInput, type PredictDiseaseInput,
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
export async function predictDisease(stateId: string, body: PredictDiseaseInput, signal?: AbortSignal) {
  const response = await apiRequest(sessionPath(stateId, "predict-disease"), { method: "POST", body, signal, timeoutMs: 120_000, schema: diseasePredictionSchema });
  if (response.state_id !== stateId) throw mismatchedResponse("disease evidence", stateId, response.state_id);
  return response;
}

export async function getWeatherSnapshot(stateId: string, targetDate: string, signal?: AbortSignal) {
  const response = await apiRequest(`${sessionPath(stateId, "weather-snapshot")}?target_date=${encodeURIComponent(targetDate)}`, { signal, schema: weatherSnapshotSchema });
  if (response.state_id !== stateId) throw mismatchedResponse("weather", stateId, response.state_id);
  if (response.target_date !== targetDate) throw new CropTwinApiError({ kind: "malformed", code: "WEATHER_DATE_MISMATCH", message: "FastAPI returned weather for a different date.", details: { requested_target_date: targetDate, returned_target_date: response.target_date } });
  return response;
}

export async function computeWaterState(stateId: string, body: ComputeWaterStateRequest, signal?: AbortSignal) {
  const response = await apiRequest(sessionPath(stateId, "compute-water-state"), { method: "POST", body, signal, schema: waterStateSchema });
  if (response.state_id !== stateId) throw mismatchedResponse("water state", stateId, response.state_id);
  if (response.water_update_id !== body.water_update_id) throw new CropTwinApiError({ kind: "malformed", code: "WATER_UPDATE_ID_MISMATCH", message: "FastAPI returned water state for a different update ID." });
  if (body.last_irrigation_event?.irrigation_event_id && response.reported_irrigation_event_id !== body.last_irrigation_event.irrigation_event_id) throw new CropTwinApiError({ kind: "malformed", code: "IRRIGATION_EVENT_ID_MISMATCH", message: "FastAPI returned different reported irrigation identity." });
  return response;
}

export async function updateTwinState(stateId: string, signal?: AbortSignal) {
  const response = await apiRequest(sessionPath(stateId, "update-twin-state"), { method: "POST", body: { state_id: stateId }, signal, schema: updateTwinStateSchema });
  if (response.state_id !== stateId) throw mismatchedResponse("twin state", stateId, response.state_id);
  return response;
}

export async function advanceOneDay(stateId: string, body: AdvanceOneDayRequest, signal?: AbortSignal) {
  const response = await apiRequest(sessionPath(stateId, "advance-one-day"), { method: "POST", body, signal, schema: advanceOneDaySchema });
  if (response.state_id !== stateId) throw mismatchedResponse("advancement", stateId, response.state_id);
  if (response.advancement_id !== body.advancement_id) throw new CropTwinApiError({ kind: "malformed", code: "ADVANCEMENT_ID_MISMATCH", message: "FastAPI returned a different advancement ID." });
  if (response.target_date !== body.target_date) throw new CropTwinApiError({ kind: "malformed", code: "ADVANCEMENT_DATE_MISMATCH", message: "FastAPI returned a different advancement target date." });
  if (response.water_state.state_id !== stateId || response.twin_state.state_id !== stateId) throw mismatchedResponse("nested advancement state", stateId, response.water_state.state_id);
  return response;
}

function mismatchedResponse(resource: string, expected: string, received: string) {
  return new CropTwinApiError({ kind: "malformed", code: "RESPONSE_STATE_ID_MISMATCH", message: `FastAPI returned ${resource} for a different session.`, details: { expected_state_id: expected, returned_state_id: received } });
}

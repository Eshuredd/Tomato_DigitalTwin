import { apiRequest } from './client';
import { advanceOneDaySchema, createdSessionSchema, diseasePredictionSchema, farmSchema, farmsSchema, healthSchema, loadedSessionSchema, plotSchema, plotsSchema, systemInfoSchema, updateTwinStateSchema, waterStateSchema, weatherSnapshotSchema, type AdvanceOneDayRequest, type AdvanceOneDayResponse, type ComputeWaterStateRequest, type CreateCropCycleInput, type CreateFarmInput, type CreatePlotInput, type CreateSessionInput, type CreatedSession, type DiseasePrediction, type Farm, type Health, type LoadedSession, type Plot, type PredictDiseaseInput, type SystemInfo, type UpdateTwinStateResponse, type WaterStateResponse, type WeatherSnapshot } from './contracts';
import { CropTwinApiError } from './errors';
import { farmPath, plotPath, queryString, sessionPath } from './paths';
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
export async function predictDisease(stateId: string, body: PredictDiseaseInput, signal?: AbortSignal): Promise<DiseasePrediction> {
  const response = await apiRequest(sessionPath(stateId, 'predict-disease'), { method: 'POST', body, signal, timeoutMs: 120_000, schema: diseasePredictionSchema });
  if (response.state_id !== stateId) throw responseStateMismatch('disease evidence', stateId, response.state_id);
  return response;
}
export async function getWeatherSnapshot(stateId: string, targetDate: string, signal?: AbortSignal): Promise<WeatherSnapshot> {
  const response = await apiRequest(`${sessionPath(stateId, 'weather-snapshot')}${queryString({ target_date: targetDate })}`, { signal, schema: weatherSnapshotSchema });
  if (response.state_id !== stateId) throw responseStateMismatch('weather', stateId, response.state_id);
  if (response.target_date !== targetDate) throw new CropTwinApiError({ kind: 'malformed', code: 'WEATHER_DATE_MISMATCH', message: 'FastAPI returned weather for a different date.', details: { requested_target_date: targetDate, returned_target_date: response.target_date } });
  return response;
}
export async function computeWaterState(stateId: string, body: ComputeWaterStateRequest, signal?: AbortSignal): Promise<WaterStateResponse> {
  if (body.state_id !== stateId) throw new CropTwinApiError({ kind: 'malformed', code: 'REQUEST_STATE_ID_MISMATCH', message: 'Water request does not belong to this session.' });
  const response = await apiRequest(sessionPath(stateId, 'compute-water-state'), { method: 'POST', body, signal, schema: waterStateSchema });
  if (response.state_id !== stateId) throw responseStateMismatch('water state', stateId, response.state_id);
  if (body.water_update_id && response.water_update_id !== body.water_update_id) throw new CropTwinApiError({ kind: 'malformed', code: 'WATER_UPDATE_ID_MISMATCH', message: 'FastAPI returned water state for a different update identity.' });
  return response;
}
export async function updateTwinState(stateId: string, signal?: AbortSignal): Promise<UpdateTwinStateResponse> {
  const response = await apiRequest(sessionPath(stateId, 'update-twin-state'), { method: 'POST', body: { state_id: stateId }, signal, schema: updateTwinStateSchema });
  if (response.state_id !== stateId) throw responseStateMismatch('twin state', stateId, response.state_id);
  return response;
}
export async function advanceOneDay(stateId: string, body: AdvanceOneDayRequest, signal?: AbortSignal): Promise<AdvanceOneDayResponse> {
  if (body.state_id !== stateId) throw new CropTwinApiError({ kind: 'malformed', code: 'REQUEST_STATE_ID_MISMATCH', message: 'Advancement request does not belong to this session.' });
  const response = await apiRequest(sessionPath(stateId, 'advance-one-day'), { method: 'POST', body, signal, schema: advanceOneDaySchema });
  if (response.state_id !== stateId || response.water_state.state_id !== stateId || response.twin_state.state_id !== stateId) throw responseStateMismatch('advancement', stateId, response.state_id);
  if (response.advancement_id !== body.advancement_id) throw new CropTwinApiError({ kind: 'malformed', code: 'ADVANCEMENT_ID_MISMATCH', message: 'FastAPI returned a different advancement identity.' });
  if (response.target_date !== body.target_date) throw new CropTwinApiError({ kind: 'malformed', code: 'ADVANCEMENT_DATE_MISMATCH', message: 'FastAPI returned a different advancement date.' });
  return response;
}
function responseStateMismatch(resource: string, expected: string, received: string) { return new CropTwinApiError({ kind: 'malformed', code: 'RESPONSE_STATE_ID_MISMATCH', message: `FastAPI returned ${resource} for a different session.`, details: { expected_state_id: expected, returned_state_id: received } }); }

import { CropTwinApiClient, encodePath } from "./client";
import type {
  ActualActionCreateRequest,
  ActualActionResponse,
  AdvanceOneDayRequest,
  AdvanceOneDayResponse,
  ComputeWaterStateRequest,
  CreateCropCycleRequest,
  CreateSessionRequest,
  DiseasePredictionRequest,
  DiseasePredictionResponse,
  FarmCreateRequest,
  FarmResponse,
  HealthResponse,
  NarrationResponse,
  PlotCreateRequest,
  PlotResponse,
  RecommendationResponse,
  SessionHistoryResponse,
  SessionResponse,
  SessionStateResponse,
  SimulateActionsRequest,
  SimulateActionsResponse,
  SystemInfoResponse,
  UpdateTwinStateResponse,
  WaterStateResponse,
  WeatherSnapshotResponse,
} from "@/lib/types/api";

export class CropTwinEndpoints {
  constructor(private readonly client: CropTwinApiClient) {}

  getHealth(): Promise<HealthResponse> {
    return this.client.request<HealthResponse>("/health");
  }

  getSystemInfo(): Promise<SystemInfoResponse> {
    return this.client.request<SystemInfoResponse>("/system-info");
  }

  createSession(request: CreateSessionRequest): Promise<SessionResponse> {
    return this.client.request<SessionResponse, CreateSessionRequest>("/sessions", {
      method: "POST",
      body: request,
    });
  }

  getSession(stateId: string): Promise<SessionStateResponse> {
    return this.client.request<SessionStateResponse>(
      `/sessions/${encodePath(stateId)}`,
    );
  }

  getSessionHistory(stateId: string): Promise<SessionHistoryResponse> {
    return this.client.request<SessionHistoryResponse>(
      `/sessions/${encodePath(stateId)}/history`,
    );
  }

  predictDisease(
    stateId: string,
    request: Omit<DiseasePredictionRequest, "state_id">,
  ): Promise<DiseasePredictionResponse> {
    return this.client.request<DiseasePredictionResponse, DiseasePredictionRequest>(
      `/sessions/${encodePath(stateId)}/predict-disease`,
      { method: "POST", body: { state_id: stateId, ...request } },
    );
  }

  getWeatherSnapshot(
    stateId: string,
    targetDate: string,
  ): Promise<WeatherSnapshotResponse> {
    const query = new URLSearchParams({ target_date: targetDate });
    return this.client.request<WeatherSnapshotResponse>(
      `/sessions/${encodePath(stateId)}/weather-snapshot?${query.toString()}`,
    );
  }

  computeWaterState(
    stateId: string,
    request: Omit<ComputeWaterStateRequest, "state_id">,
  ): Promise<WaterStateResponse> {
    return this.client.request<WaterStateResponse, ComputeWaterStateRequest>(
      `/sessions/${encodePath(stateId)}/compute-water-state`,
      { method: "POST", body: { state_id: stateId, ...request } },
    );
  }

  advanceOneDay(
    stateId: string,
    request: Omit<AdvanceOneDayRequest, "state_id">,
  ): Promise<AdvanceOneDayResponse> {
    return this.client.request<AdvanceOneDayResponse, AdvanceOneDayRequest>(
      `/sessions/${encodePath(stateId)}/advance-one-day`,
      { method: "POST", body: { state_id: stateId, ...request } },
    );
  }

  updateTwinState(stateId: string): Promise<UpdateTwinStateResponse> {
    return this.client.request<UpdateTwinStateResponse, { state_id: string }>(
      `/sessions/${encodePath(stateId)}/update-twin-state`,
      { method: "POST", body: { state_id: stateId } },
    );
  }

  simulateActions(
    stateId: string,
    request: Omit<SimulateActionsRequest, "state_id">,
  ): Promise<SimulateActionsResponse> {
    return this.client.request<SimulateActionsResponse, SimulateActionsRequest>(
      `/sessions/${encodePath(stateId)}/simulate-actions`,
      { method: "POST", body: { state_id: stateId, ...request } },
    );
  }

  recommend(stateId: string): Promise<RecommendationResponse> {
    return this.client.request<RecommendationResponse>(
      `/sessions/${encodePath(stateId)}/recommend`,
      { method: "POST" },
    );
  }

  narrate(stateId: string): Promise<NarrationResponse> {
    return this.client.request<NarrationResponse>(
      `/sessions/${encodePath(stateId)}/narrate`,
      { method: "POST" },
    );
  }

  createActualAction(
    stateId: string,
    request: ActualActionCreateRequest,
  ): Promise<ActualActionResponse> {
    return this.client.request<ActualActionResponse, ActualActionCreateRequest>(
      `/sessions/${encodePath(stateId)}/actual-actions`,
      { method: "POST", body: request },
    );
  }

  listActualActions(
    stateId: string,
    limit = 50,
  ): Promise<ActualActionResponse[]> {
    const query = new URLSearchParams({ limit: String(limit) });
    return this.client.request<ActualActionResponse[]>(
      `/sessions/${encodePath(stateId)}/actual-actions?${query.toString()}`,
    );
  }

  createFarm(request: FarmCreateRequest): Promise<FarmResponse> {
    return this.client.request<FarmResponse, FarmCreateRequest>("/farms", {
      method: "POST",
      body: request,
    });
  }

  listFarms(): Promise<FarmResponse[]> {
    return this.client.request<FarmResponse[]>("/farms");
  }

  getFarm(farmId: string): Promise<FarmResponse> {
    return this.client.request<FarmResponse>(`/farms/${encodePath(farmId)}`);
  }

  createPlot(farmId: string, request: PlotCreateRequest): Promise<PlotResponse> {
    return this.client.request<PlotResponse, PlotCreateRequest>(
      `/farms/${encodePath(farmId)}/plots`,
      { method: "POST", body: request },
    );
  }

  listPlots(farmId: string): Promise<PlotResponse[]> {
    return this.client.request<PlotResponse[]>(
      `/farms/${encodePath(farmId)}/plots`,
    );
  }

  getPlot(plotId: string): Promise<PlotResponse> {
    return this.client.request<PlotResponse>(`/plots/${encodePath(plotId)}`);
  }

  createCropCycle(
    plotId: string,
    request: CreateCropCycleRequest,
  ): Promise<SessionResponse> {
    return this.client.request<SessionResponse, CreateCropCycleRequest>(
      `/plots/${encodePath(plotId)}/crop-cycles`,
      { method: "POST", body: request },
    );
  }
}

export function createCropTwinEndpoints(baseUrl: string): CropTwinEndpoints {
  return new CropTwinEndpoints(new CropTwinApiClient({ baseUrl }));
}

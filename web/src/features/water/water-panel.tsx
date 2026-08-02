"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiErrorView } from "@/components/ui/api-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Panel } from "@/components/ui/panel";
import { IrrigationInput } from "@/features/irrigation/irrigation-input";
import type { IrrigationDraftResult } from "@/features/irrigation/irrigation-utils";
import { createBrowserEndpoints } from "@/lib/api/browser";
import { CropTwinApiError } from "@/lib/api/errors";
import type { CropTwinEndpoints } from "@/lib/api/endpoints";
import type {
  ComputeWaterStateRequest,
} from "@/lib/types/api";
import {
  useWorkflowDispatch,
  useWorkflowState,
} from "@/features/workflow/workflow-context";
import { initialWeatherDate } from "@/features/weather/weather-utils";
import {
  buildComputeWaterRequest,
  generateWaterUpdateId,
  waterUpdatePayloadSignature,
} from "./water-utils";
import { WaterResult } from "./water-result";

export type WaterPanelEndpoints = Pick<CropTwinEndpoints, "computeWaterState">;

const NO_IRRIGATION_RESULT: IrrigationDraftResult = {
  valid: true,
  event: null,
  signature: "none",
  error: null,
};

export function WaterPanel({
  endpoints,
}: {
  endpoints?: WaterPanelEndpoints;
}) {
  const defaultEndpoints = useMemo(() => createBrowserEndpoints(), []);
  const api = endpoints ?? defaultEndpoints;
  const {
    activeStateId,
    advancementPending,
    latestWaterObservationId,
    latestWaterSequence,
    recommendationPending,
    session,
    simulationPending,
    twinUpdatePending,
    water,
    waterComputationPending,
    weatherDraft,
    weatherDate,
  } = useWorkflowState();
  const dispatch = useWorkflowDispatch();
  const activeStateRef = useRef(activeStateId);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentRequestSignatureRef = useRef<string | null>(null);
  const currentRequestRef = useRef<{ stateId: string; requestId: string } | null>(null);
  const requestRef = useRef(0);
  const waterIdentityRef = useRef<{ signature: string; waterUpdateId: string } | null>(
    null,
  );
  const lastIrrigationSignatureRef = useRef("none");
  const [currentDate, setCurrentDate] = useState(() =>
    initialWeatherDate(session?.planting_date),
  );
  const [irrigationDraft, setIrrigationDraft] =
    useState<IrrigationDraftResult>(NO_IRRIGATION_RESULT);
  const [error, setError] = useState<CropTwinApiError | string | null>(null);

  useEffect(() => {
    activeStateRef.current = activeStateId;
    requestRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    currentRequestSignatureRef.current = null;
    waterIdentityRef.current = null;
    lastIrrigationSignatureRef.current = "none";
    const timeoutId = window.setTimeout(() => {
      setIrrigationDraft(NO_IRRIGATION_RESULT);
      setError(null);
      setCurrentDate(initialWeatherDate(session?.planting_date));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [activeStateId, session?.planting_date]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      requestRef.current += 1;
      const currentRequest = currentRequestRef.current;
      if (currentRequest) {
        dispatch({
          type: "waterComputationFinished",
          stateId: currentRequest.stateId,
          requestId: currentRequest.requestId,
        });
      }
      currentRequestRef.current = null;
    };
  }, [dispatch]);

  useEffect(() => {
    if (!weatherDate) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setCurrentDate(weatherDate);
    }, 0);
    waterIdentityRef.current = null;
    return () => window.clearTimeout(timeoutId);
  }, [weatherDate]);

  const currentRequestSignature = useMemo(() => {
    if (!activeStateId || !weatherDraft || !currentDate || !irrigationDraft.valid) {
      return null;
    }
    const payload: Omit<ComputeWaterStateRequest, "state_id" | "water_update_id"> = {
      current_date: currentDate,
      weather: weatherDraft,
      last_irrigation_event: irrigationDraft.event,
    };
    if (latestWaterSequence > 0 && latestWaterObservationId) {
      payload.base_water_observation_id = latestWaterObservationId;
      payload.base_water_sequence = latestWaterSequence;
    }
    return waterUpdatePayloadSignature({
      stateId: activeStateId,
      payload,
    });
  }, [
    activeStateId,
    currentDate,
    irrigationDraft,
    latestWaterObservationId,
    latestWaterSequence,
    weatherDraft,
  ]);

  useEffect(() => {
    currentRequestSignatureRef.current = currentRequestSignature;
  }, [currentRequestSignature]);

  const handleIrrigationChange = useCallback(
    (result: IrrigationDraftResult) => {
      setIrrigationDraft(result);
      const nextSignature = result.valid ? result.signature : `invalid:${result.error ?? ""}`;
      if (lastIrrigationSignatureRef.current !== nextSignature) {
        lastIrrigationSignatureRef.current = nextSignature;
        waterIdentityRef.current = null;
        if (activeStateId) {
          dispatch({ type: "waterInvalidated", stateId: activeStateId });
        }
      }
    },
    [activeStateId, dispatch],
  );

  async function computeWater(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeStateId || waterComputationPending || twinUpdatePending || advancementPending || simulationPending || recommendationPending) {
      return;
    }
    if (!weatherDraft) {
      setError("Reviewed weather inputs are required before water computation.");
      return;
    }
    if (!irrigationDraft.valid) {
      setError(irrigationDraft.error ?? "Fix recent irrigation before computing water state.");
      return;
    }
    if (!currentDate) {
      setError("Water computation date is required.");
      return;
    }
    if (session?.planting_date && currentDate < session.planting_date) {
      setError("Water computation date cannot be before the planting date.");
      return;
    }

    const requestStateId = activeStateId;
    const payloadWithoutId: Omit<
      ComputeWaterStateRequest,
      "state_id" | "water_update_id"
    > = {
      current_date: currentDate,
      weather: weatherDraft,
      last_irrigation_event: irrigationDraft.event,
    };
    if (latestWaterSequence > 0 && latestWaterObservationId) {
      payloadWithoutId.base_water_observation_id = latestWaterObservationId;
      payloadWithoutId.base_water_sequence = latestWaterSequence;
    }
    const signature = waterUpdatePayloadSignature({
      stateId: requestStateId,
      payload: payloadWithoutId,
    });
    if (waterIdentityRef.current?.signature !== signature) {
      waterIdentityRef.current = {
        signature,
        waterUpdateId: generateWaterUpdateId(),
      };
    }
    const request = buildComputeWaterRequest({
      baseWaterObservationId: latestWaterObservationId,
      currentDate,
      lastIrrigationEvent: irrigationDraft.event,
      latestWaterSequence,
      waterUpdateId: waterIdentityRef.current.waterUpdateId,
      weather: weatherDraft,
    });
    const requestId = `water-${requestRef.current + 1}`;
    requestRef.current += 1;
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    currentRequestRef.current = { stateId: requestStateId, requestId };
    currentRequestSignatureRef.current = signature;
    dispatch({
      type: "waterComputationStarted",
      stateId: requestStateId,
      requestId,
      signature,
    });
    setError(null);
    try {
      const response = await api.computeWaterState(requestStateId, request, {
        signal: abortController.signal,
      });
      if (
        activeStateRef.current !== requestStateId ||
        requestRef.current !== Number(requestId.replace("water-", "")) ||
        currentRequestSignatureRef.current !== signature
      ) {
        return;
      }
      if (response.state_id !== requestStateId) {
        throw new CropTwinApiError({
          kind: "malformed",
          status: null,
          code: "FRONTEND_MALFORMED_RESPONSE",
          message: "The backend returned water state for a different session.",
        });
      }
      dispatch({ type: "waterReceived", stateId: requestStateId, water: response });
    } catch (caught) {
      if (
        caught instanceof CropTwinApiError &&
        caught.kind === "abort"
      ) {
        return;
      }
      if (
        activeStateRef.current !== requestStateId ||
        requestRef.current !== Number(requestId.replace("water-", ""))
      ) {
        return;
      }
      setError(
        caught instanceof CropTwinApiError
          ? caught
          : caught instanceof Error
            ? caught.message
            : "Could not compute water state.",
      );
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
      if (currentRequestRef.current?.requestId === requestId) {
        currentRequestRef.current = null;
      }
      dispatch({
        type: "waterComputationFinished",
        stateId: requestStateId,
        requestId,
      });
    }
  }

  const dateMismatch = Boolean(weatherDate && currentDate && weatherDate !== currentDate);

  return (
    <Panel>
      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div>
          <h2 className="text-xl font-semibold">Water state</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
            Submit the reviewed weather and optional recent irrigation event to
            the existing deterministic water-state endpoint.
          </p>
          {latestWaterSequence === 0 ? (
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              This will create the first canonical water observation for the
              active session.
            </p>
          ) : (
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              This computation will extend the canonical water lineage from
              base sequence {latestWaterSequence}.
            </p>
          )}
          {!activeStateId ? (
            <div className="mt-4">
              <Notice tone="warning">
                Create or load an active session before computing water state.
              </Notice>
            </div>
          ) : null}
          {activeStateId && !weatherDraft ? (
            <div className="mt-4">
              <Notice tone="warning">
                Review weather values before computing water state.
              </Notice>
            </div>
          ) : null}
          <form className="mt-5 grid gap-5" onSubmit={computeWater}>
            <Field label="Water computation date" htmlFor="water_current_date">
              <Input
                disabled={!activeStateId || waterComputationPending || twinUpdatePending || advancementPending || simulationPending || recommendationPending}
                id="water_current_date"
                min={session?.planting_date}
                onChange={(event) => {
                  setCurrentDate(event.currentTarget.value);
                  waterIdentityRef.current = null;
                  if (activeStateId) {
                    dispatch({ type: "waterInvalidated", stateId: activeStateId });
                  }
                }}
                required
                type="date"
                value={currentDate}
              />
            </Field>
            <IrrigationInput
              key={activeStateId ?? "inactive"}
              disabled={!activeStateId || waterComputationPending || twinUpdatePending || advancementPending || simulationPending || recommendationPending}
              onChange={handleIrrigationChange}
            />
            {dateMismatch ? (
              <Notice tone="warning">
                Reviewed weather originated from {weatherDate}; this water request
                will use {currentDate}.
              </Notice>
            ) : null}
            <Button
              type="submit"
              disabled={
                !activeStateId ||
                !weatherDraft ||
                !irrigationDraft.valid ||
                waterComputationPending ||
                twinUpdatePending ||
                advancementPending ||
                simulationPending ||
                recommendationPending
              }
            >
              {waterComputationPending ? "Computing water state" : "Compute water state"}
            </Button>
          </form>
          <div aria-live="polite" className="mt-4 grid gap-3">
            {typeof error === "string" ? <Notice tone="warning">{error}</Notice> : null}
            {error instanceof CropTwinApiError ? <ApiErrorView error={error} /> : null}
          </div>
        </div>
        <div className="min-w-0">
          {water ? (
            <WaterResult result={water} />
          ) : (
            <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
              <h3 className="font-semibold">No water state yet</h3>
              <p className="mt-2 text-sm text-[var(--color-muted)]">
                Results will appear here after the backend computes the water
                state for the active session.
              </p>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function Field({
  children,
  htmlFor,
  label,
}: {
  children: React.ReactNode;
  htmlFor: string;
  label: string;
}) {
  return (
    <div className="grid gap-1.5">
      <label className="text-sm font-medium" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}

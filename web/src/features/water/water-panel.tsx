"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiErrorView } from "@/components/ui/api-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Panel } from "@/components/ui/panel";
import { IrrigationInput } from "@/features/irrigation/irrigation-input";
import { createBrowserEndpoints } from "@/lib/api/browser";
import { CropTwinApiError } from "@/lib/api/errors";
import type { CropTwinEndpoints } from "@/lib/api/endpoints";
import type {
  ComputeWaterStateRequest,
  LastIrrigationEvent,
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

export function WaterPanel({
  endpoints,
}: {
  endpoints?: WaterPanelEndpoints;
}) {
  const defaultEndpoints = useMemo(() => createBrowserEndpoints(), []);
  const api = endpoints ?? defaultEndpoints;
  const {
    activeStateId,
    latestWaterObservationId,
    latestWaterSequence,
    session,
    water,
    weatherDraft,
  } = useWorkflowState();
  const dispatch = useWorkflowDispatch();
  const activeStateRef = useRef(activeStateId);
  const requestRef = useRef(0);
  const waterIdentityRef = useRef<{ signature: string; waterUpdateId: string } | null>(
    null,
  );
  const lastIrrigationSignatureRef = useRef("none");
  const [currentDate, setCurrentDate] = useState(() =>
    initialWeatherDate(session?.planting_date),
  );
  const [lastIrrigationEvent, setLastIrrigationEvent] =
    useState<LastIrrigationEvent | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<CropTwinApiError | string | null>(null);

  useEffect(() => {
    activeStateRef.current = activeStateId;
    requestRef.current += 1;
    waterIdentityRef.current = null;
    lastIrrigationSignatureRef.current = "none";
    const timeoutId = window.setTimeout(() => {
      setLastIrrigationEvent(null);
      setPending(false);
      setError(null);
      setCurrentDate(initialWeatherDate(session?.planting_date));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [activeStateId, session?.planting_date]);

  const handleIrrigationChange = useCallback(
    (event: LastIrrigationEvent | null, signature: string) => {
      setLastIrrigationEvent(event);
      if (lastIrrigationSignatureRef.current !== signature) {
        lastIrrigationSignatureRef.current = signature;
        waterIdentityRef.current = null;
        dispatch({ type: "waterInvalidated" });
      }
    },
    [dispatch],
  );

  async function computeWater(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeStateId || pending) {
      return;
    }
    if (!weatherDraft) {
      setError("Reviewed weather inputs are required before water computation.");
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
      last_irrigation_event: lastIrrigationEvent,
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
      lastIrrigationEvent,
      latestWaterSequence,
      waterUpdateId: waterIdentityRef.current.waterUpdateId,
      weather: weatherDraft,
    });
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setPending(true);
    setError(null);
    try {
      const response = await api.computeWaterState(requestStateId, request);
      if (activeStateRef.current !== requestStateId || requestRef.current !== requestId) {
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
      if (activeStateRef.current !== requestStateId || requestRef.current !== requestId) {
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
      if (activeStateRef.current === requestStateId && requestRef.current === requestId) {
        setPending(false);
      }
    }
  }

  return (
    <Panel>
      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div>
          <h2 className="text-xl font-semibold">Initial water state</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
            Submit the reviewed weather and optional recent irrigation event to
            the existing deterministic water-state endpoint.
          </p>
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
                disabled={!activeStateId || pending}
                id="water_current_date"
                min={session?.planting_date}
                onChange={(event) => {
                  setCurrentDate(event.currentTarget.value);
                  waterIdentityRef.current = null;
                  dispatch({ type: "waterInvalidated" });
                }}
                required
                type="date"
                value={currentDate}
              />
            </Field>
            <IrrigationInput
              disabled={!activeStateId || pending}
              onChange={handleIrrigationChange}
            />
            <Button
              type="submit"
              disabled={!activeStateId || !weatherDraft || pending}
            >
              {pending ? "Computing water state" : "Compute initial water state"}
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

"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiErrorView } from "@/components/ui/api-error";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { Panel } from "@/components/ui/panel";
import { IrrigationInput } from "@/features/irrigation/irrigation-input";
import type { IrrigationDraftResult } from "@/features/irrigation/irrigation-utils";
import { weatherInputFromSnapshot } from "@/features/weather/weather-utils";
import {
  useWorkflowDispatch,
  useWorkflowState,
} from "@/features/workflow/workflow-context";
import { createBrowserEndpoints } from "@/lib/api/browser";
import { CropTwinApiError } from "@/lib/api/errors";
import type { CropTwinEndpoints } from "@/lib/api/endpoints";
import type { AdvanceOneDayResponse, UpdateTwinStateResponse } from "@/lib/types/api";
import { AdvancementResult } from "./advancement-result";
import {
  ADVANCEMENT_CATCH_UP_NOTICE,
  ADVANCEMENT_TWIN_REFRESH_FAILED_NOTICE,
  advancementPayloadSignature,
  buildAdvanceOneDayRequest,
  deriveNextAdvancementDate,
  evaluateAdvancementTransition,
  generateAdvancementId,
  type TwinRefreshStatus,
} from "./advancement-utils";

export type AdvancementPanelEndpoints = Pick<
  CropTwinEndpoints,
  "advanceOneDay" | "updateTwinState"
>;

const NO_IRRIGATION_RESULT: IrrigationDraftResult = {
  valid: true,
  event: null,
  signature: "none",
  error: null,
};

export function AdvancementPanel({
  endpoints,
}: {
  endpoints?: AdvancementPanelEndpoints;
}) {
  const defaultEndpoints = useMemo(() => createBrowserEndpoints(), []);
  const api = endpoints ?? defaultEndpoints;
  const {
    activeStateId,
    advancementNotice,
    advancementPending,
    advancementTransitionKind,
    advancementTwinRefreshStatus,
    disease,
    diseaseRequestPending,
    latestAdvancement,
    latestWaterObservationId,
    latestWaterSequence,
    retainedAdvancement,
    twin,
    twinUpdatePending,
    water,
    waterComputationPending,
    weatherDate,
    weatherDraft,
    weatherSnapshot,
  } = useWorkflowState();
  const dispatch = useWorkflowDispatch();
  const activeStateRef = useRef(activeStateId);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentRequestRef = useRef<{ requestId: string; stateId: string } | null>(null);
  const requestRef = useRef(0);
  const identityRef = useRef<{ advancementId: string; signature: string } | null>(null);
  const sourceSignatureRef = useRef<string | null>(null);
  const currentSequenceRef = useRef(latestWaterSequence);
  const currentSnapshotIdRef = useRef<string | null>(twin?.snapshot_id ?? null);
  const requiredDate = twin ? deriveNextAdvancementDate(twin.current_state.observed_at) : null;
  const canonicalWaterDate =
    twin?.current_state.observed_at.slice(0, 10) ?? water?.observed_at.slice(0, 10) ?? null;
  const hasCanonicalWaterLineage = Boolean(latestWaterObservationId && latestWaterSequence > 0);
  const inconsistentWaterLineage = Boolean(
    (latestWaterSequence > 0 && !latestWaterObservationId) ||
      (latestWaterObservationId && latestWaterSequence === 0),
  );
  const [irrigationDraft, setIrrigationDraft] =
    useState<IrrigationDraftResult>(NO_IRRIGATION_RESULT);
  const [manualWeatherAccepted, setManualWeatherAccepted] = useState(false);
  const [error, setError] = useState<CropTwinApiError | string | null>(null);

  const fetchedWeatherForRequiredDate = Boolean(
    weatherSnapshot &&
      requiredDate &&
      weatherDate === requiredDate &&
      weatherSnapshot.target_date === requiredDate,
  );
  const fetchedWeatherForWrongDate = Boolean(
    weatherSnapshot &&
      requiredDate &&
      (weatherDate !== requiredDate || weatherSnapshot.target_date !== requiredDate),
  );
  const fetchedWeatherUnchanged = Boolean(
    fetchedWeatherForRequiredDate &&
      weatherDraft &&
      weatherSnapshot &&
      weatherSignature(weatherDraft) === weatherSignature(weatherInputFromSnapshot(weatherSnapshot)),
  );
  const manualWeatherRequired = Boolean(
    weatherDraft && !fetchedWeatherUnchanged && !fetchedWeatherForWrongDate,
  );
  const weatherAccepted = Boolean(
    weatherDraft &&
      requiredDate &&
      !fetchedWeatherForWrongDate &&
      (fetchedWeatherUnchanged || (manualWeatherRequired && manualWeatherAccepted)),
  );

  const sourceSignature = useMemo(() => {
    if (!activeStateId || !requiredDate || !weatherDraft || !irrigationDraft.valid) {
      return null;
    }
    return advancementPayloadSignature({
      irrigationEvent: irrigationDraft.event,
      stateId: activeStateId,
      targetDate: requiredDate,
      weather: weatherDraft,
    });
  }, [activeStateId, irrigationDraft, requiredDate, weatherDraft]);

  useEffect(() => {
    activeStateRef.current = activeStateId;
    currentSequenceRef.current = latestWaterSequence;
    currentSnapshotIdRef.current = twin?.snapshot_id ?? null;
    sourceSignatureRef.current = sourceSignature;
  }, [activeStateId, latestWaterSequence, sourceSignature, twin?.snapshot_id]);

  useEffect(() => {
    requestRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    const currentRequest = currentRequestRef.current;
    if (currentRequest) {
      dispatch({
        type: "advancementFinished",
        stateId: currentRequest.stateId,
        requestId: currentRequest.requestId,
      });
    }
    currentRequestRef.current = null;
    const timeoutId = window.setTimeout(() => {
      setError(null);
      setManualWeatherAccepted(false);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [
    activeStateId,
    dispatch,
    latestWaterSequence,
    requiredDate,
    sourceSignature,
    twin?.snapshot_id,
  ]);

  useEffect(() => {
    identityRef.current = null;
    const timeoutId = window.setTimeout(() => {
      setError(null);
      setManualWeatherAccepted(false);
      setIrrigationDraft(NO_IRRIGATION_RESULT);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [activeStateId, requiredDate]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      requestRef.current += 1;
      const currentRequest = currentRequestRef.current;
      if (currentRequest) {
        dispatch({
          type: "advancementFinished",
          stateId: currentRequest.stateId,
          requestId: currentRequest.requestId,
        });
      }
      currentRequestRef.current = null;
    };
  }, [dispatch]);

  const handleIrrigationChange = useCallback((result: IrrigationDraftResult) => {
    setIrrigationDraft(result);
  }, []);

  const canAdvance = Boolean(
    activeStateId &&
      disease &&
      hasCanonicalWaterLineage &&
      !inconsistentWaterLineage &&
      latestWaterSequence > 0 &&
      twin &&
      requiredDate &&
      weatherAccepted &&
      irrigationDraft.valid &&
      sourceSignature &&
      !diseaseRequestPending &&
      !waterComputationPending &&
      !twinUpdatePending &&
      !advancementPending,
  );

  async function advanceOneDay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !activeStateId ||
      !hasCanonicalWaterLineage ||
      inconsistentWaterLineage ||
      !twin ||
      !requiredDate ||
      !weatherDraft ||
      !sourceSignature ||
      !canAdvance
    ) {
      return;
    }

    if (identityRef.current?.signature !== sourceSignature) {
      identityRef.current = {
        advancementId: generateAdvancementId(),
        signature: sourceSignature,
      };
    }

    const requestStateId = activeStateId;
    const requestNumber = requestRef.current + 1;
    const requestId = `advancement-${requestNumber}`;
    const requestSignature = sourceSignature;
    const advancementId = identityRef.current.advancementId;
    const capturedTargetDate = requiredDate;
    const capturedSequence = latestWaterSequence;
    const capturedSnapshotId = twin.snapshot_id ?? null;
    requestRef.current = requestNumber;
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    currentRequestRef.current = { stateId: requestStateId, requestId };
    sourceSignatureRef.current = requestSignature;
    dispatch({
      type: "advancementStarted",
      stateId: requestStateId,
      requestId,
      signature: requestSignature,
    });
    setError(null);

    try {
      const response = await api.advanceOneDay(
        requestStateId,
        buildAdvanceOneDayRequest({
          advancementId,
          irrigationEvent: irrigationDraft.event,
          targetDate: capturedTargetDate,
          weather: weatherDraft,
        }),
        { signal: abortController.signal },
      );
      if (
        activeStateRef.current !== requestStateId ||
        requestRef.current !== requestNumber ||
        sourceSignatureRef.current !== requestSignature ||
        currentSequenceRef.current !== capturedSequence ||
        currentSnapshotIdRef.current !== capturedSnapshotId
      ) {
        return;
      }
      if (
        response.state_id !== requestStateId ||
        response.advancement_id !== advancementId ||
        response.target_date !== capturedTargetDate
      ) {
        throw new CropTwinApiError({
          kind: "malformed",
          status: null,
          code: "FRONTEND_MALFORMED_RESPONSE",
          message: "The backend returned advancement data for a different request.",
        });
      }

      const transition = evaluateAdvancementTransition({
        advancementCreated: response.advancement_created,
        currentSequence: capturedSequence,
        currentTwin: twin,
        response,
      });
      let refreshedTwin: UpdateTwinStateResponse | null = null;
      let twinRefreshStatus: TwinRefreshStatus = "not_needed";
      let notice = transition.notice;
      let retainedResponse: AdvanceOneDayResponse | null = transition.retainResponse ? response : null;

      if (transition.refreshAuthoritativeTwin) {
        try {
          refreshedTwin = await api.updateTwinState(requestStateId, {
            signal: abortController.signal,
          });
          if (
            activeStateRef.current !== requestStateId ||
            requestRef.current !== requestNumber ||
            sourceSignatureRef.current !== requestSignature
          ) {
            return;
          }
          if (refreshedTwin.state_id !== requestStateId) {
            throw new CropTwinApiError({
              kind: "malformed",
              status: null,
              code: "FRONTEND_MALFORMED_RESPONSE",
              message: "The backend returned refreshed twin state for a different session.",
            });
          }
          twinRefreshStatus = "succeeded";
          if (transition.kind === "catch_up_retry") {
            notice = ADVANCEMENT_CATCH_UP_NOTICE;
          }
        } catch (caught) {
          if (caught instanceof CropTwinApiError && caught.kind === "abort") {
            return;
          }
          twinRefreshStatus = "failed";
          notice = ADVANCEMENT_TWIN_REFRESH_FAILED_NOTICE;
          retainedResponse = response;
        }
      }

      dispatch({
        type: "advancementApplied",
        stateId: requestStateId,
        requestId,
        response,
        ...(transition.replaceCanonicalWater ? { canonicalWater: response.water_state } : {}),
        ...(transition.replaceTwinFromResponse
          ? { canonicalTwin: response.twin_state }
          : transition.invalidateCurrentTwin
            ? { canonicalTwin: refreshedTwin }
            : refreshedTwin
              ? { canonicalTwin: refreshedTwin }
              : {}),
        retainedResponse,
        notice,
        transitionKind: transition.kind,
        twinRefreshStatus,
      });
    } catch (caught) {
      if (caught instanceof CropTwinApiError && caught.kind === "abort") {
        return;
      }
      if (activeStateRef.current !== requestStateId || requestRef.current !== requestNumber) {
        return;
      }
      setError(
        caught instanceof CropTwinApiError
          ? caught
          : caught instanceof Error
            ? caught.message
            : "Could not advance the canonical state.",
      );
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
      if (currentRequestRef.current?.requestId === requestId) {
        currentRequestRef.current = null;
      }
      dispatch({
        type: "advancementFinished",
        stateId: requestStateId,
        requestId,
      });
    }
  }

  return (
    <Panel>
      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div>
          <h2 className="text-xl font-semibold">One-day advancement</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
            Advance the deterministic canonical state by exactly one required
            day. Simulation and recommendation are separate workflow steps.
          </p>
          <div className="mt-4 grid gap-3">
            {!activeStateId ? <Notice tone="warning">Create or load an active session before advancing.</Notice> : null}
            {activeStateId && !disease ? <Notice tone="warning">Submit disease evidence before advancing.</Notice> : null}
            {activeStateId && disease && !hasCanonicalWaterLineage && !inconsistentWaterLineage ? (
              <Notice tone="warning">Compute canonical water state before advancing.</Notice>
            ) : null}
            {inconsistentWaterLineage ? (
              <Notice tone="warning">Canonical water lineage is incomplete; recompute water state before advancing.</Notice>
            ) : null}
            {activeStateId && disease && hasCanonicalWaterLineage && !twin ? (
              <Notice tone="warning">Update canonical twin state before advancing.</Notice>
            ) : null}
            {twin && !requiredDate ? <Notice tone="warning">The current twin timestamp cannot derive the required next date.</Notice> : null}
            {requiredDate && !weatherDraft ? <Notice tone="warning">Review weather for {requiredDate} before advancing.</Notice> : null}
            {requiredDate && fetchedWeatherForWrongDate ? (
              <Notice tone="warning">Retrieve weather for {requiredDate} before advancing.</Notice>
            ) : null}
            {requiredDate && weatherDraft && manualWeatherRequired ? (
              <Notice tone="warning">
                Reviewed weather values were manually entered or edited for {requiredDate}.
                Acknowledge manual next-day weather before advancing.
              </Notice>
            ) : null}
          </div>

          <form className="mt-5 grid gap-5" onSubmit={advanceOneDay}>
            <div className="grid gap-2 text-sm">
              <span>Canonical water date: {canonicalWaterDate ?? "Unavailable"}</span>
              <span>Required next date: {requiredDate ?? "Unavailable"}</span>
              <span>Current water sequence: {latestWaterSequence}</span>
              <span>Advancement ID: generated on submit for the current payload</span>
            </div>

            <IrrigationInput
              key={activeStateId ?? "inactive"}
              disabled={advancementPending}
              onChange={handleIrrigationChange}
            />

            {manualWeatherRequired ? (
              <label className="flex gap-3 text-sm text-[var(--color-muted)]">
                <input
                  checked={manualWeatherAccepted}
                  disabled={advancementPending}
                  onChange={(event) => setManualWeatherAccepted(event.currentTarget.checked)}
                  type="checkbox"
                />
                <span>I acknowledge these reviewed weather values are the next-day advancement weather.</span>
              </label>
            ) : null}

            <Button type="submit" disabled={!canAdvance}>
              {advancementPending ? "Advancing one day" : "Advance one day"}
            </Button>
          </form>

          <div aria-live="polite" className="mt-4 grid gap-3">
            {advancementPending ? (
              <p className="text-sm font-medium text-[var(--color-muted)]">
                Advancing deterministic state.
              </p>
            ) : null}
            {typeof error === "string" ? <Notice tone="warning">{error}</Notice> : null}
            {error instanceof CropTwinApiError ? <ApiErrorView error={error} /> : null}
          </div>
        </div>

        <div className="min-w-0">
          <AdvancementResult
            canonicalDate={canonicalWaterDate}
            currentSequence={latestWaterSequence}
            latestResponse={latestAdvancement}
            notice={advancementNotice}
            requiredDate={requiredDate}
            retainedResponse={retainedAdvancement}
            transitionKind={advancementTransitionKind}
            twinRefreshStatus={advancementTwinRefreshStatus}
          />
        </div>
      </div>
    </Panel>
  );
}

function weatherSignature(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as object).sort());
}

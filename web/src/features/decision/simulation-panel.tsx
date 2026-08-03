"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ApiErrorView } from "@/components/ui/api-error";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { Panel } from "@/components/ui/panel";
import { useWorkflowDispatch, useWorkflowState } from "@/features/workflow/workflow-context";
import { createBrowserEndpoints } from "@/lib/api/browser";
import { CropTwinApiError } from "@/lib/api/errors";
import type { CropTwinEndpoints } from "@/lib/api/endpoints";
import type { ActionEnum } from "@/lib/types/api";
import {
  ACTION_LABELS,
  ACTION_ORDER,
  canonicalTwinDecisionSignature,
  normalizeRequestedActions,
  simulationSourceSignature,
  validateSimulationForRequestedActions,
} from "./decision-utils";
import { SimulationResult } from "./simulation-result";

export type SimulationPanelEndpoints = Pick<CropTwinEndpoints, "simulateActions">;

export function SimulationPanel({
  endpoints,
}: {
  endpoints?: SimulationPanelEndpoints;
}) {
  const defaultEndpoints = useMemo(() => createBrowserEndpoints(), []);
  const api = endpoints ?? defaultEndpoints;
  const {
    activeStateId,
    advancementPending,
    diseaseRequestPending,
    recommendationPending,
    simulation,
    acceptedSimulationActions,
    simulationPending,
    twin,
    twinUpdatePending,
    waterComputationPending,
  } = useWorkflowState();
  const dispatch = useWorkflowDispatch();
  const [selectedActions, setSelectedActions] = useState<ActionEnum[]>([...ACTION_ORDER]);
  const [error, setError] = useState<CropTwinApiError | string | null>(null);
  const activeStateRef = useRef(activeStateId);
  const requestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const currentRequestRef = useRef<{ stateId: string; requestId: string } | null>(null);
  const sourceSignatureRef = useRef<string | null>(null);
  const twinSignatureRef = useRef<string | null>(null);

  const twinSignature = useMemo(() => {
    if (!activeStateId || !twin) {
      return null;
    }
    return canonicalTwinDecisionSignature({ stateId: activeStateId, twin });
  }, [activeStateId, twin]);

  const sourceSignature = useMemo(() => {
    if (!activeStateId || !twin || selectedActions.length === 0) {
      return null;
    }
    return simulationSourceSignature({
      actions: selectedActions,
      stateId: activeStateId,
      twin,
    });
  }, [activeStateId, selectedActions, twin]);

  useEffect(() => {
    activeStateRef.current = activeStateId;
    requestRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    const currentRequest = currentRequestRef.current;
    if (currentRequest) {
      dispatch({
        type: "simulationFinished",
        stateId: currentRequest.stateId,
        requestId: currentRequest.requestId,
      });
    }
    currentRequestRef.current = null;
    const timeoutId = window.setTimeout(() => {
      setError(null);
      setSelectedActions([...ACTION_ORDER]);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [activeStateId, dispatch, twinSignature]);

  useEffect(() => {
    sourceSignatureRef.current = sourceSignature;
  }, [sourceSignature]);

  useEffect(() => {
    twinSignatureRef.current = twinSignature;
  }, [twinSignature]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      requestRef.current += 1;
      const currentRequest = currentRequestRef.current;
      if (currentRequest) {
        dispatch({
          type: "simulationFinished",
          stateId: currentRequest.stateId,
          requestId: currentRequest.requestId,
        });
      }
    };
  }, [dispatch]);

  const disabledByPending = Boolean(
    diseaseRequestPending ||
      waterComputationPending ||
      twinUpdatePending ||
      advancementPending ||
      simulationPending ||
      recommendationPending,
  );
  const canSimulate = Boolean(activeStateId && twin && sourceSignature && selectedActions.length > 0 && !disabledByPending);

  function toggleAction(action: ActionEnum) {
    setSelectedActions((current) => {
      const selected = current.includes(action)
        ? current.filter((item) => item !== action)
        : [...current, action];
      const normalized = ACTION_ORDER.filter((item) => selected.includes(item));
      if (
        activeStateId &&
        simulation &&
        !sameActionSet(normalized, acceptedSimulationActions)
      ) {
        dispatch({ type: "simulationInvalidated", stateId: activeStateId });
      }
      return normalized;
    });
  }

  async function submitSimulation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeStateId || !twin || !sourceSignature || disabledByPending) {
      return;
    }
    let requestedActions: ActionEnum[];
    try {
      requestedActions = normalizeRequestedActions(selectedActions);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Select at least one candidate action.");
      return;
    }

    const requestStateId = activeStateId;
    const requestNumber = requestRef.current + 1;
    const requestId = `simulation-${requestNumber}`;
    const requestSignature = sourceSignature;
    const requestTwinSignature = twinSignature;
    requestRef.current = requestNumber;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    currentRequestRef.current = { stateId: requestStateId, requestId };
    sourceSignatureRef.current = requestSignature;
    dispatch({
      type: "simulationStarted",
      stateId: requestStateId,
      requestId,
      sourceSignature: requestSignature,
    });
    setError(null);

    try {
      const response = await api.simulateActions(
        requestStateId,
        { actions: requestedActions },
        { signal: controller.signal },
      );
      if (
        activeStateRef.current !== requestStateId ||
        requestRef.current !== requestNumber ||
        sourceSignatureRef.current !== requestSignature ||
        twinSignatureRef.current !== requestTwinSignature
      ) {
        return;
      }
      const accepted = validateSimulationForRequestedActions({
        response,
        requestedActions,
        expectedStateId: requestStateId,
      });
      dispatch({
        type: "simulationReceived",
        stateId: requestStateId,
        requestId,
        simulation: accepted,
        actions: requestedActions,
        sourceSignature: requestSignature,
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
            : "Could not simulate selected actions.",
      );
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      if (currentRequestRef.current?.requestId === requestId) {
        currentRequestRef.current = null;
      }
      dispatch({ type: "simulationFinished", stateId: requestStateId, requestId });
    }
  }

  return (
    <Panel>
      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div>
          <h2 className="text-xl font-semibold">Candidate action simulation</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
            Submit explicit irrigation candidates to the deterministic backend
            simulator for the current canonical twin.
          </p>
          <div className="mt-4 grid gap-3">
            {!activeStateId ? <Notice tone="warning">Create or load an active session before simulation.</Notice> : null}
            {activeStateId && !twin ? <Notice tone="warning">Update canonical twin state before simulation.</Notice> : null}
            {selectedActions.length === 0 ? <Notice tone="warning">Select at least one candidate action.</Notice> : null}
          </div>
          <form className="mt-5 grid gap-5" onSubmit={submitSimulation}>
            <fieldset className="grid gap-3" disabled={!activeStateId || !twin || disabledByPending}>
              <legend className="text-sm font-semibold">Candidate actions</legend>
              {ACTION_ORDER.map((action) => (
                <label className="flex items-start gap-3 text-sm" key={action}>
                  <input
                    checked={selectedActions.includes(action)}
                    className="mt-1"
                    onChange={() => toggleAction(action)}
                    type="checkbox"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium">{ACTION_LABELS[action]}</span>
                    <span className="block break-words text-xs text-[var(--color-muted)]">{action}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <Button type="submit" disabled={!canSimulate}>
              {simulationPending ? "Simulating selected actions" : "Simulate selected actions"}
            </Button>
          </form>
          <div aria-live="polite" className="mt-4 grid gap-3">
            {simulationPending ? (
              <p className="text-sm font-medium text-[var(--color-muted)]">
                Simulating selected candidate actions.
              </p>
            ) : null}
            {typeof error === "string" ? <Notice tone="warning">{error}</Notice> : null}
            {error instanceof CropTwinApiError ? <ApiErrorView error={error} /> : null}
          </div>
        </div>
        <div className="min-w-0">
          <SimulationResult result={simulation} />
        </div>
      </div>
    </Panel>
  );
}

function sameActionSet(left: ActionEnum[], right: ActionEnum[]): boolean {
  const normalizedLeft = ACTION_ORDER.filter((action) => left.includes(action));
  const normalizedRight = ACTION_ORDER.filter((action) => right.includes(action));
  return normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((action, index) => action === normalizedRight[index]);
}

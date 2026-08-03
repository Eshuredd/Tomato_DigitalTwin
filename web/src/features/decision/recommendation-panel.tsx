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
import {
  canonicalTwinDecisionSignature,
  proveAcceptedSimulationSource,
  recommendationSourceSignature,
  validateRecommendationAgainstSimulation,
} from "./decision-utils";
import { RecommendationResult } from "./recommendation-result";

export type RecommendationPanelEndpoints = Pick<CropTwinEndpoints, "recommend">;

export function RecommendationPanel({
  endpoints,
}: {
  endpoints?: RecommendationPanelEndpoints;
}) {
  const defaultEndpoints = useMemo(() => createBrowserEndpoints(), []);
  const api = endpoints ?? defaultEndpoints;
  const {
    activeStateId,
    advancementPending,
    acceptedRecommendationSourceSignature,
    diseaseRequestPending,
    recommendation,
    recommendationPending,
    simulation,
    acceptedSimulationActions,
    acceptedSimulationSourceSignature,
    simulationPending,
    twin,
    twinUpdatePending,
    waterComputationPending,
  } = useWorkflowState();
  const dispatch = useWorkflowDispatch();
  const [error, setError] = useState<CropTwinApiError | string | null>(null);
  const activeStateRef = useRef(activeStateId);
  const requestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const currentRequestRef = useRef<{ stateId: string; requestId: string } | null>(null);
  const sourceSignatureRef = useRef<string | null>(null);
  const twinSignatureRef = useRef<string | null>(null);
  const simulationRef = useRef(simulation);
  const acceptedSimulationSourceRef = useRef(acceptedSimulationSourceSignature);

  const twinSignature = useMemo(() => {
    if (!activeStateId || !twin) {
      return null;
    }
    return canonicalTwinDecisionSignature({ stateId: activeStateId, twin });
  }, [activeStateId, twin]);

  const simulationSourceProof = useMemo(() => proveAcceptedSimulationSource({
    acceptedActions: acceptedSimulationActions,
    acceptedSourceSignature: acceptedSimulationSourceSignature,
    simulation,
    stateId: activeStateId,
    twin,
  }), [
    acceptedSimulationActions,
    acceptedSimulationSourceSignature,
    activeStateId,
    simulation,
    twin,
  ]);

  const sourceSignature = useMemo(() => {
    if (!activeStateId || !twin || !simulation || !simulationSourceProof) {
      return null;
    }
    return recommendationSourceSignature({
      stateId: activeStateId,
      twin,
      simulation: simulationSourceProof.simulation,
    });
  }, [activeStateId, simulation, simulationSourceProof, twin]);

  const displayRecommendation = useMemo(() => {
    if (
      !activeStateId ||
      !recommendation ||
      !sourceSignature ||
      !simulationSourceProof ||
      acceptedRecommendationSourceSignature !== sourceSignature
    ) {
      return null;
    }
    try {
      return validateRecommendationAgainstSimulation({
        expectedStateId: activeStateId,
        recommendation,
        simulation: simulationSourceProof.simulation,
      });
    } catch {
      return null;
    }
  }, [
    acceptedRecommendationSourceSignature,
    activeStateId,
    recommendation,
    simulationSourceProof,
    sourceSignature,
  ]);

  useEffect(() => {
    activeStateRef.current = activeStateId;
    requestRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    const currentRequest = currentRequestRef.current;
    if (currentRequest) {
      dispatch({
        type: "recommendationFinished",
        stateId: currentRequest.stateId,
        requestId: currentRequest.requestId,
      });
    }
    currentRequestRef.current = null;
    const timeoutId = window.setTimeout(() => setError(null), 0);
    return () => window.clearTimeout(timeoutId);
  }, [activeStateId, dispatch, sourceSignature]);

  useEffect(() => {
    sourceSignatureRef.current = sourceSignature;
  }, [sourceSignature]);

  useEffect(() => {
    twinSignatureRef.current = twinSignature;
  }, [twinSignature]);

  useEffect(() => {
    simulationRef.current = simulation;
  }, [simulation]);

  useEffect(() => {
    acceptedSimulationSourceRef.current = simulationSourceProof?.sourceSignature ?? null;
  }, [simulationSourceProof]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      requestRef.current += 1;
      const currentRequest = currentRequestRef.current;
      if (currentRequest) {
        dispatch({
          type: "recommendationFinished",
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
  const canRecommend = Boolean(activeStateId && twin && simulation && sourceSignature && !disabledByPending);

  async function submitRecommendation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeStateId || !simulation || !sourceSignature || !simulationSourceProof || disabledByPending) {
      return;
    }

    const requestStateId = activeStateId;
    const requestNumber = requestRef.current + 1;
    const requestId = `recommendation-${requestNumber}`;
    const requestSignature = sourceSignature;
    const requestTwinSignature = twinSignature;
    const requestSimulation = simulation;
    const requestSimulationSourceSignature = simulationSourceProof.sourceSignature;
    requestRef.current = requestNumber;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    currentRequestRef.current = { stateId: requestStateId, requestId };
    sourceSignatureRef.current = requestSignature;
    dispatch({
      type: "recommendationStarted",
      stateId: requestStateId,
      requestId,
      sourceSignature: requestSignature,
    });
    setError(null);

    try {
      const response = await api.recommend(requestStateId, {
        signal: controller.signal,
      });
      if (
        activeStateRef.current !== requestStateId ||
        requestRef.current !== requestNumber ||
        sourceSignatureRef.current !== requestSignature ||
        twinSignatureRef.current !== requestTwinSignature ||
        simulationRef.current !== requestSimulation ||
        acceptedSimulationSourceRef.current !== requestSimulationSourceSignature
      ) {
        return;
      }
      const accepted = validateRecommendationAgainstSimulation({
        recommendation: response,
        simulation: simulationSourceProof.simulation,
        expectedStateId: requestStateId,
      });
      dispatch({
        type: "recommendationReceived",
        stateId: requestStateId,
        requestId,
        recommendation: accepted,
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
            : "Could not generate the recommendation.",
      );
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      if (currentRequestRef.current?.requestId === requestId) {
        currentRequestRef.current = null;
      }
      dispatch({ type: "recommendationFinished", stateId: requestStateId, requestId });
    }
  }

  return (
    <Panel>
      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div>
          <h2 className="text-xl font-semibold">Deterministic recommendation</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
            Ask the backend recommendation engine to select from the accepted
            simulation results for this canonical twin.
          </p>
          <div className="mt-4 grid gap-3">
            {!activeStateId ? <Notice tone="warning">Create or load an active session before recommendation.</Notice> : null}
            {activeStateId && !twin ? <Notice tone="warning">Update canonical twin state before recommendation.</Notice> : null}
            {activeStateId && twin && !simulation ? <Notice tone="warning">Simulate candidate actions before recommendation.</Notice> : null}
            {activeStateId && twin && simulation && !sourceSignature ? (
              <Notice tone="warning">
                Run candidate-action simulation for the current canonical twin before requesting a recommendation.
              </Notice>
            ) : null}
            {simulation && simulation.simulations.length === 0 ? <Notice tone="warning">Accepted simulation must contain at least one result.</Notice> : null}
          </div>
          <form className="mt-5" onSubmit={submitRecommendation}>
            <Button type="submit" disabled={!canRecommend}>
              {recommendationPending ? "Generating recommendation" : "Generate deterministic recommendation"}
            </Button>
          </form>
          <div aria-live="polite" className="mt-4 grid gap-3">
            {recommendationPending ? (
              <p className="text-sm font-medium text-[var(--color-muted)]">
                Generating deterministic recommendation.
              </p>
            ) : null}
            {typeof error === "string" ? <Notice tone="warning">{error}</Notice> : null}
            {error instanceof CropTwinApiError ? <ApiErrorView error={error} /> : null}
          </div>
        </div>
        <div className="min-w-0">
          <RecommendationResult result={displayRecommendation} />
        </div>
      </div>
    </Panel>
  );
}

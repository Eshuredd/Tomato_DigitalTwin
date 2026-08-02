"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ApiErrorView } from "@/components/ui/api-error";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { Panel } from "@/components/ui/panel";
import { CropTwinApiError } from "@/lib/api/errors";
import { createBrowserEndpoints } from "@/lib/api/browser";
import type { CropTwinEndpoints } from "@/lib/api/endpoints";
import {
  useWorkflowDispatch,
  useWorkflowState,
} from "@/features/workflow/workflow-context";
import { TwinResult } from "./twin-result";
import { twinSourceSignature } from "./twin-utils";

export type TwinPanelEndpoints = Pick<CropTwinEndpoints, "updateTwinState">;

export function TwinPanel({
  endpoints,
}: {
  endpoints?: TwinPanelEndpoints;
}) {
  const defaultEndpoints = useMemo(() => createBrowserEndpoints(), []);
  const api = endpoints ?? defaultEndpoints;
  const {
    activeStateId,
    advancementPending,
    disease,
    diseaseRequestPending,
    loadedCurrentState,
    recommendationPending,
    simulationPending,
    twin,
    twinUpdatePending,
    water,
    waterComputationPending,
  } = useWorkflowState();
  const dispatch = useWorkflowDispatch();
  const activeStateRef = useRef(activeStateId);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentRequestRef = useRef<{ stateId: string; requestId: string } | null>(null);
  const sourceSignatureRef = useRef<string | null>(null);
  const requestRef = useRef(0);
  const [error, setError] = useState<CropTwinApiError | string | null>(null);

  const sourceSignature = useMemo(() => {
    if (!activeStateId || !disease || !water) {
      return null;
    }
    return twinSourceSignature({
      disease,
      stateId: activeStateId,
      water,
    });
  }, [activeStateId, disease, water]);

  useEffect(() => {
    sourceSignatureRef.current = sourceSignature;
  }, [sourceSignature]);

  useEffect(() => {
    activeStateRef.current = activeStateId;
    requestRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    currentRequestRef.current = null;
    const timeoutId = window.setTimeout(() => setError(null), 0);
    return () => window.clearTimeout(timeoutId);
  }, [activeStateId, sourceSignature]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      requestRef.current += 1;
      const currentRequest = currentRequestRef.current;
      if (currentRequest) {
        dispatch({
          type: "twinUpdateFinished",
          stateId: currentRequest.stateId,
          requestId: currentRequest.requestId,
        });
      }
      currentRequestRef.current = null;
    };
  }, [dispatch]);

  const missingSession = !activeStateId;
  const missingDisease = Boolean(activeStateId && !disease);
  const missingWater = Boolean(activeStateId && disease && !water);
  const canUpdate = Boolean(
    activeStateId &&
      disease &&
      water &&
      sourceSignature &&
      !diseaseRequestPending &&
      !waterComputationPending &&
      !advancementPending &&
      !simulationPending &&
      !recommendationPending &&
      !twinUpdatePending,
  );

  async function updateTwin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeStateId || !disease || !water || !sourceSignature || !canUpdate) {
      return;
    }

    const requestStateId = activeStateId;
    const requestId = `twin-${requestRef.current + 1}`;
    requestRef.current += 1;
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    currentRequestRef.current = { stateId: requestStateId, requestId };
    sourceSignatureRef.current = sourceSignature;
    dispatch({
      type: "twinUpdateStarted",
      stateId: requestStateId,
      requestId,
      sourceSignature,
    });
    setError(null);
    try {
      const response = await api.updateTwinState(requestStateId, {
        signal: abortController.signal,
      });
      if (
        activeStateRef.current !== requestStateId ||
        requestRef.current !== Number(requestId.replace("twin-", "")) ||
        sourceSignatureRef.current !== sourceSignature
      ) {
        return;
      }
      if (response.state_id !== requestStateId) {
        throw new CropTwinApiError({
          kind: "malformed",
          status: null,
          code: "FRONTEND_MALFORMED_RESPONSE",
          message: "The backend returned twin state for a different session.",
        });
      }
      dispatch({ type: "twinReceived", stateId: requestStateId, twin: response });
    } catch (caught) {
      if (caught instanceof CropTwinApiError && caught.kind === "abort") {
        return;
      }
      if (
        activeStateRef.current !== requestStateId ||
        requestRef.current !== Number(requestId.replace("twin-", ""))
      ) {
        return;
      }
      setError(
        caught instanceof CropTwinApiError
          ? caught
          : caught instanceof Error
            ? caught.message
            : "Could not update the canonical twin state.",
      );
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
      if (currentRequestRef.current?.requestId === requestId) {
        currentRequestRef.current = null;
      }
      dispatch({
        type: "twinUpdateFinished",
        stateId: requestStateId,
        requestId,
      });
    }
  }

  return (
    <Panel>
      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div>
          <h2 className="text-xl font-semibold">Canonical twin state</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
            Assemble the canonical current twin from accepted disease evidence
            and deterministic water state.
          </p>
          <div className="mt-4 grid gap-3">
            {missingSession ? (
              <Notice tone="warning">
                Create or load an active session before updating the twin.
              </Notice>
            ) : null}
            {missingDisease ? (
              <Notice tone="warning">
                Submit disease evidence before updating the twin.
              </Notice>
            ) : null}
            {missingWater ? (
              <Notice tone="warning">
                Compute water state before updating the twin.
              </Notice>
            ) : null}
            {loadedCurrentState && !twin ? (
              <Notice>
                The loaded session includes a current state, but snapshot
                metadata is only available after an explicit twin update.
              </Notice>
            ) : null}
          </div>

          <form className="mt-5" onSubmit={updateTwin}>
            <Button type="submit" disabled={!canUpdate}>
              {twinUpdatePending ? "Updating canonical twin state" : "Update canonical twin state"}
            </Button>
          </form>

          <div aria-live="polite" className="mt-4 grid gap-3">
            {twinUpdatePending ? (
              <p className="text-sm font-medium text-[var(--color-muted)]">
                Updating canonical twin state.
              </p>
            ) : null}
            {typeof error === "string" ? <Notice tone="warning">{error}</Notice> : null}
            {error instanceof CropTwinApiError ? <ApiErrorView error={error} /> : null}
          </div>
        </div>

        <div className="min-w-0">
          {twin ? (
            <TwinResult result={twin} />
          ) : (
            <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
              <h3 className="font-semibold">No canonical twin snapshot yet</h3>
              <p className="mt-2 text-sm text-[var(--color-muted)]">
                Results will appear here after the backend updates the current
                twin from accepted observations.
              </p>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

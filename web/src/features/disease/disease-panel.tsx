"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ApiErrorView } from "@/components/ui/api-error";
import { Notice } from "@/components/ui/notice";
import { Panel } from "@/components/ui/panel";
import { createBrowserEndpoints } from "@/lib/api/browser";
import { CropTwinApiError } from "@/lib/api/errors";
import type { CropTwinEndpoints } from "@/lib/api/endpoints";
import type { SystemInfoResponse } from "@/lib/types/api";
import { useWorkflowDispatch, useWorkflowState } from "@/features/workflow/workflow-context";
import { DiseaseResult } from "./disease-result";
import { DiseaseUploadForm } from "./disease-upload-form";
import {
  DISEASE_MODEL_VERSION,
  DISEASE_REQUEST_TIMEOUT_MS,
  fileToBase64,
} from "./disease-utils";

export type DiseasePanelEndpoints = Pick<
  CropTwinEndpoints,
  "getSystemInfo" | "predictDisease"
>;

export function DiseasePanel({
  endpoints,
}: {
  endpoints?: DiseasePanelEndpoints;
}) {
  const defaultEndpoints = useMemo(() => createBrowserEndpoints(), []);
  const api = endpoints ?? defaultEndpoints;
  const { activeStateId, disease } = useWorkflowState();
  const dispatch = useWorkflowDispatch();
  const activeStateRef = useRef(activeStateId);
  const abortRef = useRef<AbortController | null>(null);
  const [modelInfo, setModelInfo] = useState<SystemInfoResponse["disease_model"] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<CropTwinApiError | string | null>(null);

  useEffect(() => {
    activeStateRef.current = activeStateId;
    abortRef.current?.abort();
    const timeoutId = window.setTimeout(() => setPending(false), 0);
    return () => window.clearTimeout(timeoutId);
  }, [activeStateId]);

  useEffect(() => {
    let ignore = false;
    api.getSystemInfo()
      .then((response) => {
        if (!ignore) {
          setModelInfo(response.disease_model);
        }
      })
      .catch(() => {
        if (!ignore) {
          setModelInfo(null);
        }
      });
    return () => {
      ignore = true;
    };
  }, [api]);

  async function submitDisease(file: File) {
    if (!activeStateId || pending) {
      return;
    }
    const requestStateId = activeStateId;
    const controller = new AbortController();
    abortRef.current = controller;
    setPending(true);
    setError(null);
    try {
      const imageBase64 = await fileToBase64(file);
      const response = await api.predictDisease(
        requestStateId,
        {
          image_base64: imageBase64,
          model_version: DISEASE_MODEL_VERSION,
        },
        {
          signal: controller.signal,
          timeoutMs: DISEASE_REQUEST_TIMEOUT_MS,
        },
      );
      if (activeStateRef.current !== requestStateId) {
        return;
      }
      dispatch({
        type: "diseaseReceived",
        stateId: requestStateId,
        disease: response,
      });
    } catch (caught) {
      if (activeStateRef.current !== requestStateId) {
        return;
      }
      if (caught instanceof CropTwinApiError) {
        if (caught.kind !== "abort") {
          setError(caught);
        }
      } else {
        setError(caught instanceof Error ? caught.message : "Could not submit disease evidence.");
      }
    } finally {
      if (activeStateRef.current === requestStateId) {
        setPending(false);
      }
    }
  }

  return (
    <Panel>
      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div>
          <h2 className="text-xl font-semibold">Disease evidence</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
            Upload one tomato leaf image for FastAPI disease inference. The
            active session state ID is used for the request.
          </p>
          {!activeStateId ? (
            <div className="mt-4">
              <Notice tone="warning">
                Create or load an active session before submitting disease
                evidence.
              </Notice>
            </div>
          ) : null}
          <div className="mt-5">
            <DiseaseUploadForm
              disabled={!activeStateId}
              onSubmit={(file) => void submitDisease(file)}
              pending={pending}
            />
          </div>
          <div aria-live="polite" className="mt-4">
            {pending ? (
              <p className="text-sm font-medium text-[var(--color-muted)]">
                Submitting disease evidence to FastAPI.
              </p>
            ) : null}
            {typeof error === "string" ? <Notice tone="warning">{error}</Notice> : null}
            {error instanceof CropTwinApiError ? <ApiErrorView error={error} /> : null}
          </div>
        </div>

        <div className="min-w-0">
          {disease ? (
            <DiseaseResult modelInfo={modelInfo} result={disease} />
          ) : (
            <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
              <h3 className="font-semibold">No disease evidence yet</h3>
              <p className="mt-2 text-sm text-[var(--color-muted)]">
                Results will appear here after the backend returns disease
                evidence for the active session.
              </p>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

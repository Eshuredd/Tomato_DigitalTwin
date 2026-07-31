"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CropTwinApiError } from "@/lib/api/errors";
import { createBrowserEndpoints } from "@/lib/api/browser";
import { getPublicEnv } from "@/lib/config/env";
import type { HealthResponse } from "@/lib/types/api";
import type { AsyncStatus } from "@/lib/types/common";
import { ApiErrorView } from "@/components/ui/api-error";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import type { BadgeTone } from "@/components/ui/status-badge";
import { StatusBadge } from "@/components/ui/status-badge";

export function HealthStatus() {
  const endpoints = useMemo(() => createBrowserEndpoints(), []);
  const [status, setStatus] = useState<AsyncStatus>("checking");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<CropTwinApiError | null>(null);
  const apiBaseUrl = getPublicEnv().apiBaseUrl;

  const checkHealth = useCallback(async () => {
    setStatus("checking");
    setError(null);
    try {
      const response = await endpoints.getHealth();
      if (response.status !== "ok") {
        setStatus("malformed");
        setHealth(null);
        setError(new CropTwinApiError({
          kind: "malformed",
          status: null,
          code: "FRONTEND_MALFORMED_RESPONSE",
          message: "The backend responded, but its health response did not match the expected format.",
        }));
        return;
      }
      setHealth(response);
      setStatus("connected");
    } catch (caught) {
      const normalized = normalizeError(caught);
      setError(normalized);
      setHealth(null);
      setStatus(
        normalized.kind === "timeout"
          ? "timeout"
          : normalized.kind === "malformed"
            ? "malformed"
            : "unavailable",
      );
    }
  }, [endpoints]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void checkHealth();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [checkHealth]);

  return (
    <Panel>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--color-muted)]">
            Backend connection
          </p>
          <div aria-live="polite" className="mt-2">
            <StatusBadge tone={badgeTone(status)}>{statusLabel(status)}</StatusBadge>
          </div>
          {health ? (
            <p className="mt-3 text-sm text-[var(--color-muted)]">
              {health.service} · {health.version}
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void checkHealth()}
          disabled={status === "checking"}
        >
          {status === "checking" ? "Checking" : "Retry"}
        </Button>
      </div>
      {error ? <div className="mt-4"><ApiErrorView error={error} /></div> : null}
      <details className="mt-4 text-sm text-[var(--color-muted)]">
        <summary className="cursor-pointer font-medium text-[var(--color-text)]">
          Technical details
        </summary>
        <p className="mt-2 break-all">API base URL: {apiBaseUrl}</p>
      </details>
    </Panel>
  );
}

function normalizeError(error: unknown): CropTwinApiError {
  if (error instanceof CropTwinApiError) {
    return error;
  }
  return new CropTwinApiError({
    kind: "network",
    status: null,
    code: "FRONTEND_NETWORK_ERROR",
    message:
      error instanceof Error
        ? error.message
        : "Could not connect to the CropTwin API.",
  });
}

function badgeTone(status: AsyncStatus): BadgeTone {
  if (status === "connected") {
    return "success";
  }
  if (status === "checking") {
    return "neutral";
  }
  if (status === "timeout" || status === "malformed") {
    return "warning";
  }
  return "danger";
}

function statusLabel(status: AsyncStatus): string {
  const labels: Record<AsyncStatus, string> = {
    idle: "Idle",
    checking: "Checking",
    connected: "Connected",
    unavailable: "Unavailable",
    timeout: "Timeout",
    malformed: "Malformed response",
  };
  return labels[status];
}

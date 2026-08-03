"use client";
import { Activity, RefreshCw } from "lucide-react";
import { ApiErrorPanel } from "@/components/shared-states/api-error-panel";
import { AsyncStatePanel } from "@/components/shared-states/async-state-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { API_BASE_URL } from "@/lib/api/config";
import { useHealth } from "@/lib/api/hooks/use-health";

export function HealthStatusCard() {
  const health = useHealth();
  return <Card><CardHeader><Activity className="size-5 text-[var(--agronomy-accent)]" aria-hidden="true" /><CardTitle>FastAPI runtime</CardTitle><CardDescription>Browser-visible health request to <span className="font-mono text-xs">{API_BASE_URL}</span>.</CardDescription></CardHeader><CardContent className="grid gap-4">{health.isLoading ? <AsyncStatePanel kind="loading" title="Checking FastAPI health" /> : null}{health.isError ? <ApiErrorPanel error={health.error} onRetry={() => health.refetch()} title="FastAPI unavailable" /> : null}{health.data ? <div className="flex flex-wrap items-center gap-3"><Badge variant={health.data.status === "ok" ? "success" : "warning"}>Status: {health.data.status}</Badge><span className="text-sm text-[var(--text-muted)]">{health.data.service} · {health.data.version}</span><Button type="button" size="sm" variant="secondary" disabled={health.isFetching} onClick={() => health.refetch()}><RefreshCw className={`size-3.5 ${health.isFetching ? "animate-spin" : ""}`} aria-hidden="true" />Retry health</Button></div> : null}</CardContent></Card>;
}

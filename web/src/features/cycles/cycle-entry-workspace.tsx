"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { FolderSearch, Sprout } from "lucide-react";
import { PageIntro } from "@/components/app-shell/page-intro";
import { ApiErrorPanel } from "@/components/shared-states/api-error-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, describedBy } from "@/components/ui/form-controls";
import { locationPayload, sessionFormSchema, soilTextures } from "@/lib/api/contracts";
import { useCreateSession } from "@/lib/api/hooks/use-sessions";
import { getSession } from "@/lib/api/operations";
import { queryKeys } from "@/lib/api/query-keys";
import { localDateInputValue } from "@/lib/dates/local-date";

type SessionInput = z.input<typeof sessionFormSchema>;
type SessionOutput = z.output<typeof sessionFormSchema>;

export function CycleEntryWorkspace() {
  const [mode, setMode] = useState<"create" | "load">("create");
  return <><PageIntro eyebrow="Current context" title="Open a crop cycle" description="Create a standalone tomato session, or load an existing state ID. Plot-backed cycles begin from a plot detail page." /><div className="mb-5 inline-flex rounded-lg border border-[var(--border-strong)] bg-[var(--surface-raised)] p-1" role="tablist" aria-label="Session entry mode"><button type="button" role="tab" aria-selected={mode === "create"} onClick={() => setMode("create")} className={`rounded-md px-4 py-2 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${mode === "create" ? "bg-[var(--agronomy-soft)] text-[var(--agronomy-strong)]" : "text-[var(--text-muted)]"}`}>Create standalone</button><button type="button" role="tab" aria-selected={mode === "load"} onClick={() => setMode("load")} className={`rounded-md px-4 py-2 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${mode === "load" ? "bg-[var(--agronomy-soft)] text-[var(--agronomy-strong)]" : "text-[var(--text-muted)]"}`}>Load existing</button></div>{mode === "create" ? <StandaloneSessionForm /> : <LoadSessionForm />}</>;
}

function StandaloneSessionForm() {
  const router = useRouter();
  const create = useCreateSession();
  const form = useForm<SessionInput, unknown, SessionOutput>({ resolver: zodResolver(sessionFormSchema), defaultValues: { planting_date: localDateInputValue(), location: { name: "", latitude: "", longitude: "", elevation_m: "" }, soil_texture: "sandy_loam" } });
  const submit = form.handleSubmit((values) => create.mutate({ crop_type: "tomato", planting_date: values.planting_date, location: locationPayload(values.location), soil_texture: values.soil_texture }, { onSuccess: (session) => router.push(`/cycle/${encodeURIComponent(session.state_id)}?mode=standalone`) }));
  return <Card className="max-w-4xl"><CardHeader><div className="grid size-10 place-items-center rounded-lg bg-[var(--agronomy-soft)] text-[var(--agronomy-strong)]"><Sprout className="size-5" aria-hidden="true" /></div><CardTitle id="standalone-session-heading">Create standalone session</CardTitle><CardDescription>This session is not attached to a farm or plot. FastAPI validates the location and resolves elevation when it is omitted.</CardDescription></CardHeader><CardContent><form aria-labelledby="standalone-session-heading" onSubmit={submit} className="grid gap-5"><div className="grid gap-4 md:grid-cols-2"><Field label="Crop type" htmlFor="session-crop"><Input id="session-crop" value="Tomato" readOnly aria-readonly="true" /></Field><Field label="Planting date" htmlFor="session-date" error={form.formState.errors.planting_date?.message}><Input id="session-date" type="date" {...form.register("planting_date")} /></Field><Field label="Location name" htmlFor="session-location" error={form.formState.errors.location?.name?.message}><Input id="session-location" {...form.register("location.name")} /></Field><Field label="Soil texture" htmlFor="session-soil" error={form.formState.errors.soil_texture?.message}><Select id="session-soil" {...form.register("soil_texture")}>{soilTextures.map((texture) => <option key={texture} value={texture}>{texture.replaceAll("_", " ")}</option>)}</Select></Field><Field label="Latitude" htmlFor="session-latitude" error={form.formState.errors.location?.latitude?.message}><Input id="session-latitude" type="number" step="any" min={-90} max={90} {...form.register("location.latitude")} /></Field><Field label="Longitude" htmlFor="session-longitude" error={form.formState.errors.location?.longitude?.message}><Input id="session-longitude" type="number" step="any" min={-180} max={180} {...form.register("location.longitude")} /></Field><Field label="Elevation (m), optional" htmlFor="session-elevation" error={form.formState.errors.location?.elevation_m?.message} hint="Leave blank for FastAPI to resolve elevation. Blank is never sent as zero."><Input id="session-elevation" type="number" step="any" min={-500} aria-describedby={describedBy("session-elevation", Boolean(form.formState.errors.location?.elevation_m), true)} {...form.register("location.elevation_m")} /></Field></div><Button type="submit" className="w-fit" disabled={create.isPending}>{create.isPending ? "Creating session…" : "Create standalone session"}</Button>{create.isError ? <ApiErrorPanel error={create.error} title="Session was not created" /> : null}</form></CardContent></Card>;
}

function LoadSessionForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [stateId, setStateId] = useState("");
  const [error, setError] = useState<unknown>();
  const [pending, setPending] = useState(false);
  async function load(event: React.FormEvent) { event.preventDefault(); const trimmed = stateId.trim(); if (!trimmed || pending) return; setPending(true); setError(undefined); try { const session = await queryClient.fetchQuery({ queryKey: queryKeys.session(trimmed), queryFn: ({ signal }) => getSession(trimmed, signal), retry: false, staleTime: 0 }); queryClient.setQueryData(queryKeys.session(trimmed), session); router.push(`/cycle/${encodeURIComponent(trimmed)}`); } catch (cause) { setError(cause); } finally { setPending(false); } }
  return <Card className="max-w-2xl"><CardHeader><div className="grid size-10 place-items-center rounded-lg bg-[var(--state-info-soft)] text-[var(--state-info-strong)]"><FolderSearch className="size-5" aria-hidden="true" /></div><CardTitle id="load-session-heading">Load existing session</CardTitle><CardDescription>FastAPI must return the state successfully before CropTwin changes routes.</CardDescription></CardHeader><CardContent><form aria-labelledby="load-session-heading" onSubmit={load} className="grid gap-4"><Field label="State ID" htmlFor="load-state-id" hint="The ID is trimmed and safely encoded in the request path."><Input id="load-state-id" value={stateId} onChange={(event) => setStateId(event.target.value)} autoComplete="off" aria-describedby="load-state-id-hint" /></Field><Button type="submit" className="w-fit" disabled={!stateId.trim() || pending}>{pending ? "Loading session…" : "Load session"}</Button>{error ? <ApiErrorPanel error={error} title="Session was not loaded" /> : null}</form></CardContent></Card>;
}

"use client";
import NextLink from "next/link";
import type { ComponentProps } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ArrowLeft, ArrowRight, MapPin, Plus } from "lucide-react";
import { PageIntro } from "@/components/app-shell/page-intro";
import { TechnicalDetails } from "@/components/data/technical-details";
import { ApiErrorPanel } from "@/components/shared-states/api-error-panel";
import { AsyncStatePanel } from "@/components/shared-states/async-state-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, describedBy } from "@/components/ui/form-controls";
import { locationPayload, plotFormSchema, soilTextures } from "@/lib/api/contracts";
import { useFarm } from "@/lib/api/hooks/use-farms";
import { useCreatePlot, usePlots } from "@/lib/api/hooks/use-plots";

function Link(props: ComponentProps<typeof NextLink>) { return <NextLink prefetch={false} {...props} />; }

type PlotFormInput = z.input<typeof plotFormSchema>;
type PlotFormOutput = z.output<typeof plotFormSchema>;

export function FarmDetailWorkspace({ farmId }: { farmId: string }) {
  const farm = useFarm(farmId) as ReturnType<typeof useFarm> & { data: NonNullable<ReturnType<typeof useFarm>["data"]> };
  const plots = usePlots(farmId);
  const create = useCreatePlot(farmId);
  const form = useForm<PlotFormInput, unknown, PlotFormOutput>({ resolver: zodResolver(plotFormSchema), defaultValues: { name: "", location: { name: "", latitude: "", longitude: "", elevation_m: "" }, soil_texture: "sandy_loam" } });
  const submit = form.handleSubmit((values) => create.mutate({ name: values.name, location: locationPayload(values.location), soil_texture: values.soil_texture }, { onSuccess: () => form.reset() }));
  if (farm.isLoading) return <AsyncStatePanel kind="loading" title="Loading farm" />;
  if (farm.isError) return <ApiErrorPanel error={farm.error} onRetry={() => farm.refetch()} title="Farm unavailable" />;
  return <>
    <Link href="/farms" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-[var(--agronomy-strong)]"><ArrowLeft className="size-4" aria-hidden="true" />All farms</Link>
    <PageIntro eyebrow="Farm detail" title={farm.data.name} description="Review this FastAPI farm record, manage its plot list, and add stored field context." />
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(22rem,0.85fr)]">
      <div className="grid content-start gap-5"><Card><CardHeader><CardTitle>Plots in {farm.data.name}</CardTitle><CardDescription>Each plot retains its own authoritative location, elevation, and soil texture.</CardDescription></CardHeader><CardContent className="grid gap-4">{plots.isLoading ? <AsyncStatePanel kind="loading" title="Loading plots" /> : null}{plots.isError ? <ApiErrorPanel error={plots.error} onRetry={() => plots.refetch()} title="Plots unavailable" /> : null}{plots.data?.length === 0 ? <AsyncStatePanel kind="empty" title="No plots in this farm" description="Add the first plot using the form beside this list." /> : null}{plots.isFetching && plots.data ? <p role="status" className="text-xs font-semibold text-[var(--state-info-strong)]">Refreshing this farm’s plots…</p> : null}{plots.data?.map((plot) => <Link key={plot.plot_id} href={`/plots/${encodeURIComponent(plot.plot_id)}`} className="group grid gap-3 rounded-xl border border-[var(--border-subtle)] p-4 outline-none transition hover:border-[var(--agronomy-border)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] sm:grid-cols-[1fr_auto] sm:items-center"><div><span className="font-semibold text-[var(--text-strong)]">{plot.name}</span><span className="mt-1 block text-sm text-[var(--text-muted)]">{plot.location.name} · {plot.soil_texture.replaceAll("_", " ")}</span></div><ArrowRight className="size-5 text-[var(--text-muted)] group-hover:text-[var(--agronomy-strong)]" aria-hidden="true" /></Link>)}</CardContent></Card><TechnicalDetails label="Farm record details" value={farm.data} /></div>
      <Card><CardHeader><div className="grid size-10 place-items-center rounded-lg bg-[var(--agronomy-soft)] text-[var(--agronomy-strong)]"><MapPin className="size-5" aria-hidden="true" /></div><CardTitle id="create-plot-heading">Create plot</CardTitle><CardDescription>Store exact field coordinates and soil context beneath this farm.</CardDescription></CardHeader><CardContent><form aria-labelledby="create-plot-heading" onSubmit={submit} className="grid gap-4"><Field label="Plot name" htmlFor="plot-name" error={form.formState.errors.name?.message}><Input id="plot-name" {...form.register("name")} /></Field><Field label="Location name" htmlFor="plot-location" error={form.formState.errors.location?.name?.message}><Input id="plot-location" {...form.register("location.name")} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Latitude" htmlFor="plot-latitude" error={form.formState.errors.location?.latitude?.message}><Input id="plot-latitude" type="number" step="any" min={-90} max={90} aria-describedby={describedBy("plot-latitude", Boolean(form.formState.errors.location?.latitude))} {...form.register("location.latitude")} /></Field><Field label="Longitude" htmlFor="plot-longitude" error={form.formState.errors.location?.longitude?.message}><Input id="plot-longitude" type="number" step="any" min={-180} max={180} {...form.register("location.longitude")} /></Field></div><Field label="Elevation (m), optional" htmlFor="plot-elevation" error={form.formState.errors.location?.elevation_m?.message} hint="Leave blank to store no elevation. Blank is never converted to zero."><Input id="plot-elevation" type="number" step="any" min={-500} aria-describedby={describedBy("plot-elevation", Boolean(form.formState.errors.location?.elevation_m), true)} {...form.register("location.elevation_m")} /></Field><Field label="Soil texture" htmlFor="plot-soil" error={form.formState.errors.soil_texture?.message}><Select id="plot-soil" {...form.register("soil_texture")}>{soilTextures.map((texture) => <option key={texture} value={texture}>{texture.replaceAll("_", " ")}</option>)}</Select></Field><Button type="submit" disabled={create.isPending}><Plus className="size-4" aria-hidden="true" />{create.isPending ? "Creating plot…" : "Create plot"}</Button>{create.isError ? <ApiErrorPanel error={create.error} title="Plot was not created" /> : null}</form></CardContent></Card>
    </div>
  </>;
}

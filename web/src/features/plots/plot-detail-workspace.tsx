"use client";
import NextLink from "next/link";
import type { ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ArrowLeft, CalendarPlus } from "lucide-react";
import { PageIntro } from "@/components/app-shell/page-intro";
import { LocationSummary } from "@/components/data/location-summary";
import { TechnicalDetails } from "@/components/data/technical-details";
import { ApiErrorPanel } from "@/components/shared-states/api-error-panel";
import { AsyncStatePanel } from "@/components/shared-states/async-state-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form-controls";
import { cropCycleFormSchema } from "@/lib/api/contracts";
import { useFarm } from "@/lib/api/hooks/use-farms";
import { usePlot } from "@/lib/api/hooks/use-plots";
import { useCreateCropCycle } from "@/lib/api/hooks/use-sessions";
import { localDateInputValue } from "@/lib/dates/local-date";

function Link(props: ComponentProps<typeof NextLink>) { return <NextLink prefetch={false} {...props} />; }

type CycleForm = z.input<typeof cropCycleFormSchema>;
export function PlotDetailWorkspace({ plotId }: { plotId: string }) {
  const router = useRouter();
  const plot = usePlot(plotId) as ReturnType<typeof usePlot> & { data: NonNullable<ReturnType<typeof usePlot>["data"]> };
  const farm = useFarm(plot.data?.farm_id ?? "");
  const create = useCreateCropCycle(plotId);
  const form = useForm<CycleForm>({ resolver: zodResolver(cropCycleFormSchema), defaultValues: { planting_date: localDateInputValue() } });
  if (plot.isLoading) return <AsyncStatePanel kind="loading" title="Loading plot" />;
  if (plot.isError) return <ApiErrorPanel error={plot.error} onRetry={() => plot.refetch()} title="Plot unavailable" />;
  const submit = form.handleSubmit((values) => create.mutate({ crop_type: "tomato", planting_date: values.planting_date }, { onSuccess: (session) => router.push(`/cycle/${encodeURIComponent(session.state_id)}?plotId=${encodeURIComponent(plot.data.plot_id)}`) }));
  return <>
    <Link href={`/farms/${encodeURIComponent(plot.data.farm_id)}`} className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-[var(--agronomy-strong)]"><ArrowLeft className="size-4" aria-hidden="true" />Back to {farm.data?.name ?? "farm"}</Link>
    <PageIntro eyebrow="Plot detail" title={plot.data.name} description="Use this stored plot context to create a tomato crop cycle without recreating inherited location or soil data." />
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]"><div className="grid content-start gap-5"><Card><CardHeader><CardTitle>Authoritative field context</CardTitle><CardDescription>{farm.data ? `${farm.data.name} · ` : ""}Values returned by FastAPI for this plot.</CardDescription></CardHeader><CardContent><LocationSummary location={plot.data.location} soilTexture={plot.data.soil_texture} /></CardContent></Card><TechnicalDetails label="Plot record details" value={plot.data} /></div><Card><CardHeader><div className="grid size-10 place-items-center rounded-lg bg-[var(--agronomy-soft)] text-[var(--agronomy-strong)]"><CalendarPlus className="size-5" aria-hidden="true" /></div><CardTitle id="create-cycle-heading">Start plot-backed cycle</CardTitle><CardDescription>Only crop type and planting date are submitted. FastAPI inherits the selected plot context.</CardDescription></CardHeader><CardContent><form aria-labelledby="create-cycle-heading" onSubmit={submit} className="grid gap-4"><div className="rounded-lg border border-[var(--agronomy-border)] bg-[var(--agronomy-soft)] p-3 text-sm text-[var(--agronomy-strong)]"><strong>Crop:</strong> Tomato<br /><strong>Plot:</strong> {plot.data.name}</div><Field label="Planting date" htmlFor="cycle-planting-date" error={form.formState.errors.planting_date?.message}><Input id="cycle-planting-date" type="date" {...form.register("planting_date")} /></Field><Button type="submit" disabled={create.isPending}>{create.isPending ? "Starting cycle…" : "Start crop cycle"}</Button>{create.isError ? <ApiErrorPanel error={create.error} title="Crop cycle was not created" /> : null}</form></CardContent></Card></div>
  </>;
}

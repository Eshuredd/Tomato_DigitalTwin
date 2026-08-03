"use client";
import NextLink from "next/link";
import type { ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ArrowRight, Building2, Plus } from "lucide-react";
import { PageIntro } from "@/components/app-shell/page-intro";
import { ApiErrorPanel } from "@/components/shared-states/api-error-panel";
import { AsyncStatePanel } from "@/components/shared-states/async-state-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, describedBy } from "@/components/ui/form-controls";
import { useCreateFarm, useFarms } from "@/lib/api/hooks/use-farms";
import { farmFormSchema } from "@/lib/api/contracts";

function Link(props: ComponentProps<typeof NextLink>) { return <NextLink prefetch={false} {...props} />; }

type FarmForm = z.input<typeof farmFormSchema>;

export function FarmsWorkspace() {
  const router = useRouter();
  const farms = useFarms();
  const create = useCreateFarm();
  const form = useForm<FarmForm>({ resolver: zodResolver(farmFormSchema), defaultValues: { name: "" } });
  const submit = form.handleSubmit((values) => create.mutate(values, { onSuccess: (farm) => router.push(`/farms/${encodeURIComponent(farm.farm_id)}`) }));
  return <>
    <PageIntro eyebrow="Land structure" title="Farms and plots" description="Manage persistent farm records and open each farm to work with its authoritative plots." />
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(20rem,0.75fr)]">
      <Card>
        <CardHeader><CardTitle>Stored farms</CardTitle><CardDescription>Farm names come from FastAPI. Open a row to manage its plots.</CardDescription></CardHeader>
        <CardContent className="grid gap-4">
          {farms.isLoading ? <AsyncStatePanel kind="loading" title="Loading farms" /> : null}
          {farms.isError ? <ApiErrorPanel error={farms.error} onRetry={() => farms.refetch()} title="Farms unavailable" /> : null}
          {farms.data?.length === 0 ? <AsyncStatePanel kind="empty" title="No farms yet" description="Create the first farm using the adjacent form." /> : null}
          {farms.isFetching && farms.data ? <p role="status" className="text-xs font-semibold text-[var(--state-info-strong)]">Refreshing farm records…</p> : null}
          {farms.data?.length ? <div className="overflow-x-auto"><table className="w-full min-w-[34rem] border-collapse text-left text-sm"><thead><tr className="border-b border-[var(--border-strong)] text-xs uppercase tracking-wide text-[var(--text-muted)]"><th className="px-3 py-3">Farm</th><th className="px-3 py-3">Last updated</th><th className="px-3 py-3"><span className="sr-only">Open</span></th></tr></thead><tbody>{farms.data.map((farm) => <tr key={farm.farm_id} className="border-b border-[var(--border-subtle)] last:border-0"><td className="px-3 py-4"><span className="block font-semibold text-[var(--text-strong)]">{farm.name}</span><span className="mt-1 block font-mono text-xs text-[var(--text-muted)]">{farm.farm_id}</span></td><td className="px-3 py-4 text-[var(--text-muted)]">{new Date(farm.updated_at).toLocaleString()}</td><td className="px-3 py-4 text-right"><Link href={`/farms/${encodeURIComponent(farm.farm_id)}`} className="inline-flex items-center gap-1 font-semibold text-[var(--agronomy-strong)] underline-offset-4 hover:underline">Manage <ArrowRight className="size-4" aria-hidden="true" /></Link></td></tr>)}</tbody></table></div> : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><div className="grid size-10 place-items-center rounded-lg bg-[var(--agronomy-soft)] text-[var(--agronomy-strong)]"><Building2 className="size-5" aria-hidden="true" /></div><CardTitle>Create farm</CardTitle><CardDescription>Add the persistent farm container. Plot location and soil details are added afterward.</CardDescription></CardHeader>
        <CardContent><form aria-labelledby="create-farm-heading" onSubmit={submit} className="grid gap-4"><span id="create-farm-heading" className="sr-only">Create farm</span><Field label="Farm name" htmlFor="farm-name" error={form.formState.errors.name?.message}><Input id="farm-name" autoComplete="organization" aria-invalid={Boolean(form.formState.errors.name)} aria-describedby={describedBy("farm-name", Boolean(form.formState.errors.name))} {...form.register("name")} /></Field><Button type="submit" disabled={create.isPending}><Plus className="size-4" aria-hidden="true" />{create.isPending ? "Creating farm…" : "Create farm"}</Button>{create.isError ? <ApiErrorPanel error={create.error} title="Farm was not created" /> : null}</form></CardContent>
      </Card>
    </div>
  </>;
}

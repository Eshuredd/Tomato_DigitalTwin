import { ArrowRight, ClipboardCheck, History, Route, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { PageIntro } from "@/components/app-shell/page-intro";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { HealthStatusCard } from "@/features/system/health-status-card";

export default function OverviewPage() {
  return (
    <>
      <PageIntro eyebrow="Workspace overview" title="Evidence to field decision" description="CropTwin connects field context and accepted evidence to deterministic water state, canonical twin updates, scenario comparison, recommendation, and explanation." badge="Operational workspace" />
      <Alert variant="info" className="mb-5">
        <ShieldCheck className="mt-0.5 size-4" aria-hidden="true" />
        <AlertTitle>Backend authority remains explicit</AlertTitle>
        <AlertDescription>FastAPI owns agronomy calculations, scenario projections, recommendation selection, narration, and persisted field records. The browser submits reviewed inputs and renders validated responses.</AlertDescription>
      </Alert>
      <div className="mb-5"><HealthStatusCard /></div>
      <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-[var(--border-subtle)] bg-[var(--agronomy-soft)]">
            <Badge variant="agronomy" className="w-fit"><span aria-hidden="true">◆</span> Deterministic agronomy</Badge>
            <CardTitle className="text-xl">Backend authority remains explicit</CardTitle>
            <CardDescription>FastAPI owns agronomy, persistence, simulation, and recommendation choices. The browser submits inputs and renders returned evidence.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--agronomy-border)] bg-[var(--surface-raised)] p-4">
              <p className="text-sm font-semibold text-[var(--agronomy-strong)]">Structured and stable</p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">Grounded surfaces, compact state labels, and authoritative result language distinguish deterministic outputs.</p>
            </div>
            <div className="rounded-xl border border-[var(--evidence-border)] bg-[var(--evidence-soft)] p-4">
              <Badge variant="evidence"><span aria-hidden="true">◇</span> AI evidence · supporting</Badge>
              <p className="mt-3 text-sm leading-6 text-[var(--evidence-strong)]">Disease classification remains provisional, uncertainty-aware evidence rather than a decision by itself.</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="grid size-10 place-items-center rounded-xl bg-[var(--state-info-soft)] text-[var(--state-info-strong)]"><ShieldCheck className="size-5" aria-hidden="true" /></div>
            <CardTitle>Decision boundary</CardTitle>
            <CardDescription>Supporting AI evidence informs deterministic backend policy. Recommendations never claim that a physical action occurred.</CardDescription>
          </CardHeader>
          <CardContent><p className="text-sm leading-6 text-[var(--text-muted)]">Use the guided nine-stage workflow for a current decision, then keep history and actual field actions as separate authoritative records.</p></CardContent>
        </Card>
      </div>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader><Route className="size-5 text-[var(--agronomy-accent)]" aria-hidden="true" /><CardTitle>Route-based workspace</CardTitle><CardDescription>Seven persistent application areas replace the previous single stacked page.</CardDescription></CardHeader>
          <CardFooter><Button asChild variant="secondary"><Link href="/workflow" prefetch={false}>Open guided workflow <ArrowRight className="size-4" aria-hidden="true" /></Link></Button></CardFooter>
        </Card>
        <Card>
          <CardHeader><History className="size-5 text-[var(--evidence-accent)]" aria-hidden="true" /><CardTitle>History and field records</CardTitle><CardDescription>Review canonical snapshots and record physical actions without mutating the twin automatically.</CardDescription></CardHeader><CardFooter className="flex gap-3"><Button asChild variant="secondary"><Link href="/history">History</Link></Button><Button asChild variant="secondary"><Link href="/actions"><ClipboardCheck className="size-4" />Actual actions</Link></Button></CardFooter>
        </Card>
      </div>
    </>
  );
}

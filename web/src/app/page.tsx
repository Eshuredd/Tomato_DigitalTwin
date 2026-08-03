import { ArrowRight, Layers3, Route, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { PageIntro } from "@/components/app-shell/page-intro";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export default function OverviewPage() {
  return (
    <>
      <PageIntro eyebrow="Workspace overview" title="A calm foundation for field decisions" description="CropTwin now has a route-based desktop shell and explicit decision boundaries. Feature workflows remain deliberately deferred until later milestones restore them against FastAPI." />
      <Alert variant="info" className="mb-5">
        <ShieldCheck className="mt-0.5 size-4" aria-hidden="true" />
        <AlertTitle>Foundation milestone only</AlertTitle>
        <AlertDescription>No farm, crop-cycle, evidence, simulation, or recommendation data is loaded or invented by this interface.</AlertDescription>
      </Alert>
      <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-[var(--border-subtle)] bg-[var(--agronomy-soft)]">
            <Badge variant="agronomy" className="w-fit"><span aria-hidden="true">◆</span> Deterministic agronomy</Badge>
            <CardTitle className="text-xl">Backend authority remains explicit</CardTitle>
            <CardDescription>FastAPI owns agronomy, persistence, simulation, and recommendation choices. The browser will submit inputs and render returned evidence.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--agronomy-border)] bg-[var(--surface-raised)] p-4">
              <p className="text-sm font-semibold text-[var(--agronomy-strong)]">Structured and stable</p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">Grounded surfaces, compact state labels, and authoritative result language distinguish deterministic outputs.</p>
            </div>
            <div className="rounded-xl border border-[var(--evidence-border)] bg-[var(--evidence-soft)] p-4">
              <Badge variant="evidence"><span aria-hidden="true">◇</span> AI evidence · supporting</Badge>
              <p className="mt-3 text-sm leading-6 text-[var(--evidence-strong)]">Disease classification will remain provisional, uncertainty-aware evidence rather than a decision.</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="grid size-10 place-items-center rounded-xl bg-[var(--state-info-soft)] text-[var(--state-info-strong)]"><Layers3 className="size-5" aria-hidden="true" /></div>
            <CardTitle>Milestone scope</CardTitle>
            <CardDescription>Architecture, generated contract workflow, transport, design semantics, shell, navigation, and reusable states.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between text-xs font-semibold"><span>Foundation deliverables</span><span>Milestone 1</span></div>
            <Progress className="mt-2" value={100} aria-label="Milestone 1 foundation scope represented" />
            <p className="mt-3 text-xs leading-5 text-[var(--text-muted)]">This progress bar represents the milestone scope, not product feature parity.</p>
          </CardContent>
        </Card>
      </div>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader><Route className="size-5 text-[var(--agronomy-accent)]" aria-hidden="true" /><CardTitle>Route-based workspace</CardTitle><CardDescription>Seven persistent application areas replace the previous single stacked page.</CardDescription></CardHeader>
          <CardFooter><Button asChild variant="secondary"><Link href="/workflow" prefetch={false}>Inspect workflow foundation <ArrowRight className="size-4" aria-hidden="true" /></Link></Button></CardFooter>
        </Card>
        <Card>
          <CardHeader><ShieldCheck className="size-5 text-[var(--evidence-accent)]" aria-hidden="true" /><CardTitle>Parity remains tracked</CardTitle><CardDescription>Every backend and Streamlit capability remains unimplemented until a later milestone marks it implemented and browser verified.</CardDescription></CardHeader>
        </Card>
      </div>
    </>
  );
}

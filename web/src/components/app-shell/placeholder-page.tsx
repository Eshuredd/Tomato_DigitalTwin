import { Construction, Route } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageIntro } from "./page-intro";

export function PlaceholderPage({ eyebrow, title, description, laterMilestone }: { eyebrow: string; title: string; description: string; laterMilestone: string }) {
  return (
    <>
      <PageIntro eyebrow={eyebrow} title={title} description={description} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.75fr)]">
        <Card>
          <CardHeader>
            <div className="mb-2 grid size-10 place-items-center rounded-xl bg-[var(--agronomy-soft)] text-[var(--agronomy-strong)]"><Route className="size-5" aria-hidden="true" /></div>
            <CardTitle>Route foundation is ready</CardTitle>
            <CardDescription>This route validates persistent navigation, focus management, responsive shell behavior, and visual hierarchy without implementing its backend workflow.</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert variant="info">
              <Construction className="mt-0.5 size-4" aria-hidden="true" />
              <AlertTitle>Deliberately deferred</AlertTitle>
              <AlertDescription>{laterMilestone}. No records, identifiers, timestamps, or recommendations are fabricated here.</AlertDescription>
            </Alert>
          </CardContent>
        </Card>
        <Card className="bg-[var(--surface-subtle)] shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Foundation contract</CardTitle>
            <CardDescription>FastAPI remains authoritative. Feature work will consume generated contract types through the centralized API layer.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </>
  );
}

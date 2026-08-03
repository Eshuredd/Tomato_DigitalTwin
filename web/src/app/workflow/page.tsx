import { PageIntro } from "@/components/app-shell/page-intro";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkflowStepperDemo } from "@/components/workflow/workflow-stepper-demo";
import { Info } from "lucide-react";

export default function WorkflowPage() {
  return (
    <>
      <PageIntro eyebrow="Decision sequence" title="Workflow foundation" description="A reusable nine-stage stepper makes prerequisites, progress, availability, and errors explicit without presenting every workflow form at once." />
      <Alert variant="warning" className="mb-5"><Info className="mt-0.5 size-4" aria-hidden="true" /><AlertTitle>Demonstration state only</AlertTitle><AlertDescription>The labels and statuses below exercise the component API. They do not represent a real crop-cycle state.</AlertDescription></Alert>
      <Card>
        <CardHeader><CardTitle>Nine-step prerequisite sequence</CardTitle><CardDescription>Completed, active, available, blocked, and error states include visible text. Interactive example steps support arrow keys plus Home and End.</CardDescription></CardHeader>
        <CardContent><WorkflowStepperDemo /></CardContent>
      </Card>
      <Card className="mt-5 bg-[var(--surface-subtle)] shadow-none">
        <CardHeader><CardTitle className="text-base">Related views remain outside the sequence</CardTitle><CardDescription>History and actual actions are navigable application areas, not prerequisites between Session and Narration.</CardDescription></CardHeader>
      </Card>
    </>
  );
}

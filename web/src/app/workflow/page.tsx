import Link from "next/link";
import { redirect } from "next/navigation";
import { PageIntro } from "@/components/app-shell/page-intro";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function WorkflowEntryPage({ searchParams }: { searchParams: Promise<{ stateId?: string }> }) {
  const { stateId } = await searchParams;
  if (stateId?.trim()) redirect(`/workflow/${encodeURIComponent(stateId.trim())}`);
  return <><PageIntro eyebrow="Guided workflow" title="Choose an active crop cycle" description="The workflow is scoped by an authoritative state ID." /><Card className="max-w-2xl"><CardHeader><CardTitle>No workflow session selected</CardTitle><CardDescription>Create or load a session before opening disease, weather, and irrigation preparation.</CardDescription></CardHeader><CardContent><Link href="/cycle" className="font-semibold text-[var(--agronomy-strong)] underline">Open session entry</Link></CardContent></Card></>;
}

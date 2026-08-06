import { redirect } from "next/navigation";
import { PageIntro } from "@/components/app-shell/page-intro";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/form-controls";
export default async function ActionsPage({ searchParams }: { searchParams: Promise<{ stateId?: string }> }) { const { stateId } = await searchParams; if (stateId?.trim()) redirect(`/actions/${encodeURIComponent(stateId.trim())}`); return <><PageIntro eyebrow="Field record" title="Actual actions" description="Open physical field records for a state ID." /><Card className="max-w-xl"><CardHeader><CardTitle>Choose a crop cycle</CardTitle><CardDescription>Actual actions are scoped to an authoritative FastAPI state ID.</CardDescription></CardHeader><CardContent><form className="flex gap-3"><Input name="stateId" aria-label="State ID" placeholder="Enter state ID" required /><Button type="submit">Open actions</Button></form></CardContent></Card></>; }

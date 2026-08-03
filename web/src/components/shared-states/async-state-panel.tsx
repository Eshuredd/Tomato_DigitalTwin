import { AlertCircle, Ban, CheckCircle2, Clock3, Database, FileQuestion, LoaderCircle, RefreshCw, Recycle, ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

export type SharedStateKind = "loading" | "empty" | "refreshing" | "blocked" | "error" | "timeout" | "cancelled" | "malformed" | "reused" | "created";

const presentation = {
  loading: { title: "Loading", description: "Retrieving authoritative data.", tone: "neutral" as const, icon: LoaderCircle },
  empty: { title: "Nothing here yet", description: "No authoritative records are available for this view.", tone: "neutral" as const, icon: Database },
  refreshing: { title: "Refreshing in the background", description: "Existing data remains visible while CropTwin checks for updates.", tone: "info" as const, icon: RefreshCw },
  blocked: { title: "Prerequisite required", description: "Complete the stated prerequisite before continuing.", tone: "warning" as const, icon: ShieldAlert },
  error: { title: "Request could not be completed", description: "Review the summary and retry when it is safe to do so.", tone: "destructive" as const, icon: AlertCircle },
  timeout: { title: "Request timed out", description: "The service did not respond within the configured time limit.", tone: "warning" as const, icon: Clock3 },
  cancelled: { title: "Request cancelled", description: "No result from the cancelled request was applied.", tone: "neutral" as const, icon: Ban },
  malformed: { title: "Response could not be understood", description: "CropTwin rejected a response that did not match the API contract.", tone: "destructive" as const, icon: FileQuestion },
  reused: { title: "Existing result reused", description: "FastAPI returned the authoritative idempotently reused result.", tone: "info" as const, icon: Recycle },
  created: { title: "New result created", description: "FastAPI created and returned a new authoritative result.", tone: "success" as const, icon: CheckCircle2 },
};

export function AsyncStatePanel({ kind, title, description, prerequisite, technicalDetails }: { kind: SharedStateKind; title?: string; description?: string; prerequisite?: string; technicalDetails?: unknown }) {
  const state = presentation[kind];
  const Icon = state.icon;
  if (kind === "loading") {
    return <div role="status" aria-label={title ?? state.title} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4"><div className="flex items-center gap-3"><LoaderCircle className="size-4 animate-spin text-[var(--agronomy-accent)]" aria-hidden="true" /><span className="text-sm font-semibold">{title ?? state.title}</span></div><div className="mt-4 grid gap-2"><Skeleton className="h-3 w-4/5" /><Skeleton className="h-3 w-3/5" /></div></div>;
  }
  return (
    <Alert variant={state.tone} role={kind === "error" || kind === "malformed" ? "alert" : "status"}>
      <Icon className="mt-0.5 size-4" aria-hidden="true" />
      <AlertTitle>{title ?? state.title}</AlertTitle>
      <AlertDescription>
        <p>{description ?? state.description}</p>
        {prerequisite ? <p className="mt-2 font-medium">Prerequisite: {prerequisite}</p> : null}
        {technicalDetails !== undefined ? <details className="mt-3"><summary className="cursor-pointer font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Technical details</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-black/5 p-3 text-xs">{typeof technicalDetails === "string" ? technicalDetails : JSON.stringify(technicalDetails, null, 2)}</pre></details> : null}
      </AlertDescription>
    </Alert>
  );
}

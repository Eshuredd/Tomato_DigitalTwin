import { AlertTriangle, BrainCircuit } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { DiseasePrediction } from "@/lib/api/contracts";

export function DiseaseEvidenceCard({ evidence, modelVersion }: { evidence: DiseasePrediction; modelVersion: string }) {
  const probabilities = Object.entries(evidence.class_probs).sort((a, b) => b[1] - a[1]);
  return <Card className="border-[var(--evidence-border)]">
    <CardHeader><div className="flex items-center gap-2 text-[var(--evidence-strong)]"><BrainCircuit className="size-5" aria-hidden="true" /><span className="text-xs font-bold uppercase tracking-[0.13em]">Supporting AI evidence — not a confirmed diagnosis</span></div><CardTitle>{humanize(evidence.predicted_label)}</CardTitle><CardDescription>The classifier supports field review. It does not override deterministic agronomy.</CardDescription></CardHeader>
    <CardContent className="grid gap-5">
      <div className="flex flex-wrap gap-2"><Badge variant="evidence">Category: {evidence.disease_category}</Badge><Badge variant="neutral">Confidence: {percent(evidence.confidence_calibrated)}</Badge><Badge variant={evidence.uncertainty_band === "high" ? "warning" : "neutral"}>Uncertainty: {evidence.uncertainty_band}</Badge></div>
      <dl className="grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-[var(--text-muted)]">Uncertainty score</dt><dd className="font-semibold">{evidence.uncertainty_score}</dd></div><div><dt className="text-[var(--text-muted)]">Predicted at</dt><dd className="font-semibold">{new Date(evidence.predicted_at).toLocaleString()}</dd></div><div><dt className="text-[var(--text-muted)]">Model version used</dt><dd className="font-mono text-xs font-semibold">{modelVersion}</dd></div></dl>
      {evidence.uncertainty_band === "medium" ? <Alert variant="info"><AlertTriangle className="size-5" aria-hidden="true" /><AlertTitle>Manual inspection remains useful</AlertTitle><AlertDescription>Review the leaf directly before relying on this supporting evidence.</AlertDescription></Alert> : null}
      {evidence.uncertainty_band === "high" ? <Alert variant="warning"><AlertTriangle className="size-5" aria-hidden="true" /><AlertTitle>Manual inspection recommended</AlertTitle><AlertDescription>Capture another clear leaf image or inspect the plant manually. This is not an emergency alert.</AlertDescription></Alert> : null}
      <div><h3 className="text-sm font-semibold">Class probabilities</h3><div className="mt-3 grid gap-3" role="table" aria-label="Disease class probabilities">{probabilities.map(([label, probability]) => <div key={label} role="row" className="grid grid-cols-[minmax(0,1fr)_4rem] gap-3 text-sm"><div role="cell"><div className="mb-1 flex justify-between gap-2"><span>{humanize(label)}</span></div><Progress value={probability * 100} /></div><span role="cell" className="text-right font-mono text-xs">{percent(probability)}</span></div>)}</div></div>
    </CardContent>
  </Card>;
}

function percent(value: number) { return `${(value * 100).toFixed(1)}%`; }
function humanize(label: string) { return label.replace(/^Tomato___/, "").replaceAll("_", " "); }

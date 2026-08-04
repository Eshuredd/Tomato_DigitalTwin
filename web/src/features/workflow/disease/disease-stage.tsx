"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { ApiErrorPanel } from "@/components/shared-states/api-error-panel";
import { AsyncStatePanel } from "@/components/shared-states/async-state-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usePredictDisease, type CachedDiseaseEvidence } from "@/lib/api/hooks/use-workflow";
import { useSystemInfo } from "@/lib/api/hooks/use-system-info";
import { queryKeys } from "@/lib/api/query-keys";
import { DiseaseEvidenceCard } from "./disease-evidence-card";
import { fileToRawBase64 } from "./disease-files";
import { DiseaseImageInput } from "./disease-image-input";

export function DiseaseStage({ stateId, accepted, onAccepted, onSuperseded }: { stateId: string; accepted?: CachedDiseaseEvidence; onAccepted: (evidence: CachedDiseaseEvidence) => void; onSuperseded: () => void }) {
  const queryClient = useQueryClient();
  const system = useSystemInfo();
  const prediction = usePredictDisease();
  const [selection, setSelection] = useState<{ file: File; signature: string; generation: number } | null>(null);
  const [localError, setLocalError] = useState<string>();
  const [superseded, setSuperseded] = useState(false);
  const abortRef = useRef<AbortController | undefined>(undefined);
  const requestRef = useRef(0);
  const selectionGenerationRef = useRef(0);

  useEffect(() => () => { requestRef.current += 1; abortRef.current?.abort(); }, []);
  const modelVersion = typeof system.data?.disease_model.model_version === "string" && system.data.disease_model.model_version.trim() ? system.data.disease_model.model_version : undefined;

  function changeSelection(next: { file: File; signature: string } | null) {
    const generation = selectionGenerationRef.current + 1;
    selectionGenerationRef.current = generation;
    requestRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = undefined;
    prediction.reset();
    setSelection(next ? { ...next, generation } : null);
    setLocalError(undefined);
    const hadAcceptedEvidence = Boolean(accepted || queryClient.getQueryData(queryKeys.diseaseEvidence(stateId)));
    queryClient.removeQueries({ queryKey: queryKeys.diseaseEvidence(stateId), exact: true });
    if (hadAcceptedEvidence) {
      setSuperseded(true);
      onSuperseded();
    }
  }

  async function submit() {
    if (!selection || !modelVersion || prediction.isPending) return;
    const requestNumber = requestRef.current + 1;
    requestRef.current = requestNumber;
    const signature = selection.signature;
    const selectionGeneration = selection.generation;
    const controller = new AbortController();
    abortRef.current = controller;
    setLocalError(undefined);
    try {
      const imageBase64 = await fileToRawBase64(selection.file);
      if (requestRef.current !== requestNumber || selectionGenerationRef.current !== selectionGeneration) return;
      const response = await prediction.mutateAsync({ stateId, input: { state_id: stateId, image_base64: imageBase64, model_version: modelVersion }, signal: controller.signal });
      if (requestRef.current !== requestNumber || selectionGenerationRef.current !== selectionGeneration || controller.signal.aborted) return;
      const cached = { response, fileSignature: signature, modelVersion } satisfies CachedDiseaseEvidence;
      queryClient.setQueryData(queryKeys.diseaseEvidence(stateId), cached);
      setSuperseded(false);
      onAccepted(cached);
    } catch (error) {
      if (!controller.signal.aborted && requestRef.current === requestNumber) setLocalError(error instanceof Error ? error.message : "Disease prediction failed.");
    }
  }

  return <div className="grid gap-5 xl:grid-cols-[minmax(20rem,0.85fr)_minmax(0,1.15fr)]">
    <Card><CardHeader><CardTitle>Disease evidence</CardTitle><CardDescription>Choose one leaf image, then explicitly submit it to FastAPI inference.</CardDescription></CardHeader><CardContent className="grid gap-4">
      <DiseaseImageInput disabled={prediction.isPending} onSelectionChange={changeSelection} />
      {system.isLoading ? <AsyncStatePanel kind="loading" title="Loading supported disease model" /> : null}
      {system.isError ? <ApiErrorPanel error={system.error} onRetry={() => system.refetch()} title="Disease model metadata unavailable" /> : null}
      {!system.isLoading && !system.isError && !modelVersion ? <AsyncStatePanel kind="blocked" title="Disease submission blocked" description="FastAPI system information did not expose a valid disease model version." /> : null}
      <Button type="button" className="w-fit" onClick={() => void submit()} disabled={!selection || !modelVersion || prediction.isPending}><Send className="size-4" aria-hidden="true" />{prediction.isPending ? "Running prediction…" : "Run disease prediction"}</Button>
      {localError && prediction.error ? <ApiErrorPanel error={prediction.error} title="Disease evidence unavailable" /> : localError ? <p role="alert" className="text-sm text-[var(--state-destructive-strong)]">{localError}</p> : null}
    </CardContent></Card>
    {accepted && !superseded ? <DiseaseEvidenceCard evidence={accepted.response} modelVersion={accepted.modelVersion} /> : <AsyncStatePanel kind={superseded ? "reused" : "empty"} title={superseded ? "Previous evidence superseded" : "No accepted disease evidence"} description={superseded ? "The selected image changed. Run an explicit new prediction before this stage can be accepted again." : "A selected image remains local until you run prediction. Returned evidence will appear here."} />}
  </div>;
}

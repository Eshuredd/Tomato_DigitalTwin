"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { Panel } from "@/components/ui/panel";
import { DefinitionList } from "@/components/ui/definition-list";
import { useWorkflowDispatch, useWorkflowState } from "./workflow-context";
import { selectActiveSessionSummary } from "./workflow-selectors";

export function ActiveSessionSummary() {
  const state = useWorkflowState();
  const dispatch = useWorkflowDispatch();
  const summary = selectActiveSessionSummary(state);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!copyMessage) {
      return undefined;
    }
    const timeoutId = window.setTimeout(() => setCopyMessage(null), 2500);
    return () => window.clearTimeout(timeoutId);
  }, [copyMessage]);

  if (!summary) {
    return (
      <Panel>
        <h2 className="text-xl font-semibold">Active session</h2>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          No active session. Create one or load an existing state ID before
          submitting disease evidence.
        </p>
      </Panel>
    );
  }

  async function copyStateId() {
    if (!summary) {
      return;
    }
    try {
      await navigator.clipboard.writeText(summary.stateId);
      setCopyMessage("State ID copied.");
    } catch {
      setCopyMessage("Could not copy the state ID.");
    }
  }

  return (
    <Panel>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Active session</h2>
          <DefinitionList
            className="mt-4"
            items={[
              { term: "State ID", description: summary.stateId },
              { term: "Crop", description: summary.cropType },
              { term: "Planting date", description: summary.plantingDate },
              { term: "Location", description: summary.locationName },
              { term: "Soil texture", description: summary.soilTexture.replaceAll("_", " ") },
            ]}
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
          <Button type="button" variant="secondary" onClick={() => void copyStateId()}>
            Copy state ID
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => dispatch({ type: "sessionCleared" })}
          >
            Clear active session
          </Button>
        </div>
      </div>
      {copyMessage ? (
        <div aria-live="polite" className="mt-4">
          <Notice tone={copyMessage.startsWith("State") ? "success" : "warning"}>
            {copyMessage}
          </Notice>
        </div>
      ) : null}
    </Panel>
  );
}

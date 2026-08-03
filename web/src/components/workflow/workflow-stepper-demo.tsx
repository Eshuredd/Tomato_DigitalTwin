"use client";

import { useState } from "react";
import { WorkflowStepper, workflowStepLabels, type WorkflowStep } from "./workflow-stepper";

const placeholderSteps: WorkflowStep[] = workflowStepLabels.map((label, index) => ({
  id: label.toLowerCase().replaceAll(" ", "-"),
  label,
  status: index === 0 ? "completed" : index === 1 ? "active" : index === 2 ? "available" : index === 4 ? "error" : "blocked",
  prerequisite: index === 0 ? undefined : index === 1 ? "placeholder session state" : index === 2 ? "placeholder disease evidence" : index === 4 ? "example malformed response" : "earlier workflow stages",
  interactive: index < 3,
}));

export function WorkflowStepperDemo() {
  const [selected, setSelected] = useState("Disease evidence");
  return (
    <div>
      <WorkflowStepper steps={placeholderSteps} onStepSelect={(step) => setSelected(step.label)} label="Workflow stepper placeholder demonstration" />
      <p className="mt-4 text-xs text-[var(--text-muted)]" aria-live="polite">Selected demonstration step: <strong className="text-[var(--text-default)]">{selected}</strong>. These states are placeholders, not workflow progress.</p>
    </div>
  );
}

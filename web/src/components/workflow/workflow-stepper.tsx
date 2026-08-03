"use client";

import { useRef } from "react";
import { AlertTriangle, Check, Circle, LockKeyhole, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export type WorkflowStepStatus = "completed" | "active" | "available" | "blocked" | "error";

export interface WorkflowStep {
  id: string;
  label: string;
  status: WorkflowStepStatus;
  prerequisite?: string;
  interactive?: boolean;
}

export const workflowStepLabels = [
  "Session",
  "Disease evidence",
  "Weather",
  "Irrigation",
  "Water state",
  "Twin update",
  "Simulation",
  "Recommendation",
  "Narration",
] as const;

const statusCopy: Record<WorkflowStepStatus, string> = {
  completed: "Completed",
  active: "Active",
  available: "Available",
  blocked: "Blocked",
  error: "Needs attention",
};

const statusIcon = {
  completed: Check,
  active: Play,
  available: Circle,
  blocked: LockKeyhole,
  error: AlertTriangle,
};

export function WorkflowStepper({ steps, onStepSelect, label = "CropTwin workflow progress" }: { steps: WorkflowStep[]; onStepSelect?: (step: WorkflowStep) => void; label?: string }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const interactiveIndexes = steps.flatMap((step, index) => step.interactive ? [index] : []);

  function moveFocus(currentIndex: number, key: string) {
    const position = interactiveIndexes.indexOf(currentIndex);
    if (position < 0 || interactiveIndexes.length === 0) return;
    let nextPosition = position;
    if (key === "ArrowRight" || key === "ArrowDown") nextPosition = (position + 1) % interactiveIndexes.length;
    if (key === "ArrowLeft" || key === "ArrowUp") nextPosition = (position - 1 + interactiveIndexes.length) % interactiveIndexes.length;
    if (key === "Home") nextPosition = 0;
    if (key === "End") nextPosition = interactiveIndexes.length - 1;
    refs.current[interactiveIndexes[nextPosition]]?.focus();
  }

  return (
    <nav aria-label={label} className="workflow-stepper">
      <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {steps.map((step, index) => {
          const Icon = statusIcon[step.status];
          const content = (
            <>
              <span className={cn("grid size-8 shrink-0 place-items-center rounded-full border", `step-marker-${step.status}`)} aria-hidden="true"><Icon className="size-4" /></span>
              <span className="min-w-0 flex-1 text-left">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-[var(--text-strong)]"><span className="text-[var(--text-faint)]">{String(index + 1).padStart(2, "0")}</span> · {step.label}</span>
                  <Badge variant={step.status === "error" ? "destructive" : step.status === "completed" ? "success" : step.status === "active" ? "agronomy" : step.status === "blocked" ? "neutral" : "info"}>{statusCopy[step.status]}</Badge>
                </span>
                {step.prerequisite ? <span className="mt-1 block text-xs leading-5 text-[var(--text-muted)]">Prerequisite: {step.prerequisite}</span> : null}
              </span>
            </>
          );

          return (
            <li key={step.id} className={cn("rounded-xl border bg-[var(--surface-raised)]", `step-${step.status}`)}>
              {step.interactive ? (
                <button ref={(node) => { refs.current[index] = node; }} type="button" aria-current={step.status === "active" ? "step" : undefined} className="flex h-full w-full items-start gap-3 rounded-xl p-3 outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2" onClick={() => onStepSelect?.(step)} onKeyDown={(event) => {
                  if (["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
                    event.preventDefault();
                    moveFocus(index, event.key);
                  }
                }}>{content}</button>
              ) : (
                <div className="flex h-full items-start gap-3 p-3">{content}</div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

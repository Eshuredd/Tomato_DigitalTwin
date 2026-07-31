import { HealthStatus } from "./health-status";
import { Notice } from "@/components/ui/notice";
import { Panel } from "@/components/ui/panel";
import { SessionPanel } from "@/features/session/session-panel";
import { WorkflowProvider } from "@/features/workflow/workflow-context";
import { ActiveSessionSummary } from "@/features/workflow/active-session-summary";
import { DiseasePanel } from "@/features/disease/disease-panel";

export function CropTwinShell() {
  return (
    <main className="min-h-screen bg-[var(--color-background)] text-[var(--color-text)]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <header className="grid gap-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm lg:grid-cols-[1.2fr_0.8fr] lg:p-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-[var(--color-leaf)]">
              Tomato decision support
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
              CropTwin
            </h1>
            <p className="mt-3 text-xl text-[var(--color-muted)]">
              Tomato Irrigation and Disease Digital Twin
            </p>
            <p className="mt-2 text-base text-[var(--color-muted)]">
              Deterministic Agronomy with AI-Assisted Disease Evidence
            </p>
          </div>
          <div className="grid gap-3">
            <Notice>
              Disease classification is supporting evidence only.
            </Notice>
            <Notice tone="warning">
              Deterministic agronomy owns irrigation decisions.
            </Notice>
          </div>
        </header>

        <WorkflowProvider>
          <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <HealthStatus />
            <Panel>
              <h2 className="text-xl font-semibold">Migration phase</h2>
              <p className="mt-3 text-sm leading-6 text-[var(--color-muted)]">
                Phase 2 adds active-session state and disease evidence upload
                to the Next.js migration. Weather, water computation, twin
                updates, simulations, recommendations and narration remain in
                Streamlit until their workflow screens are migrated deliberately.
              </p>
            </Panel>
          </section>

          <SessionPanel />
          <ActiveSessionSummary />
          <DiseasePanel />
        </WorkflowProvider>
      </div>
    </main>
  );
}

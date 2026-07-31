import { DefinitionList } from "@/components/ui/definition-list";
import { Notice } from "@/components/ui/notice";
import { TechnicalDetails } from "@/components/ui/technical-details";
import type { AdvanceOneDayResponse } from "@/lib/types/api";
import type { JsonObject } from "@/lib/types/common";
import {
  formatAdvancementTransition,
  type AdvancementTransitionKind,
  type TwinRefreshStatus,
} from "./advancement-utils";

export function AdvancementResult({
  canonicalDate,
  currentSequence,
  latestResponse,
  notice,
  requiredDate,
  retainedResponse,
  transitionKind,
  twinRefreshStatus,
}: {
  canonicalDate: string | null;
  currentSequence: number;
  latestResponse: AdvanceOneDayResponse | null;
  notice: string | null;
  requiredDate: string | null;
  retainedResponse: AdvanceOneDayResponse | null;
  transitionKind: AdvancementTransitionKind | string | null;
  twinRefreshStatus: TwinRefreshStatus | string | null;
}) {
  const response = retainedResponse ?? latestResponse;

  return (
    <div className="grid gap-5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
      <div>
        <h3 className="font-semibold">Advancement state</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
          Advancement updates deterministic canonical state. It does not choose
          an irrigation action.
        </p>
        <DefinitionList
          className="mt-3"
          items={[
            { term: "Canonical water date", description: canonicalDate ?? "Unavailable" },
            { term: "Required next date", description: requiredDate ?? "Unavailable" },
            { term: "Current water sequence", description: currentSequence },
            {
              term: "Transition type",
              description: formatAdvancementTransition(transitionKind as AdvancementTransitionKind | null),
            },
            { term: "Twin refresh", description: twinRefreshStatus ?? "not run" },
          ]}
        />
      </div>

      {notice ? <Notice>{notice}</Notice> : null}

      {response ? (
        <>
          <DefinitionList
            items={[
              { term: "Advancement ID", description: response.advancement_id },
              {
                term: "Status",
                description: response.advancement_created ? "created" : "reused",
              },
              { term: "Returned target date", description: response.target_date },
              {
                term: "Returned water lineage",
                description: `${response.water_state.base_water_sequence} -> ${response.water_state.water_sequence}`,
              },
              {
                term: "Returned snapshot",
                description: response.twin_state.snapshot_id ?? "None",
              },
              {
                term: "Returned snapshot metadata",
                description: response.twin_state.snapshot_created ? "created" : "reused",
              },
            ]}
          />
          <TechnicalDetails
            summary={retainedResponse ? "Historical or reused advancement response" : "Latest advancement response"}
            json={{
              state_id: response.state_id,
              advancement_id: response.advancement_id,
              target_date: response.target_date,
              advancement_created: response.advancement_created,
              water_state: response.water_state as unknown as JsonObject,
              twin_state: {
                state_id: response.twin_state.state_id,
                snapshot_id: response.twin_state.snapshot_id ?? null,
                snapshot_created: response.twin_state.snapshot_created,
                state_history_count: response.twin_state.state_history_count,
                current_state: response.twin_state.current_state as unknown as JsonObject,
              },
            } satisfies JsonObject}
          />
        </>
      ) : (
        <Notice>Run advancement to see returned water lineage and snapshot metadata.</Notice>
      )}
    </div>
  );
}

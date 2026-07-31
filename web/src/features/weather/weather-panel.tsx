"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ApiErrorView } from "@/components/ui/api-error";
import { Button } from "@/components/ui/button";
import { DefinitionList } from "@/components/ui/definition-list";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Panel } from "@/components/ui/panel";
import { TechnicalDetails } from "@/components/ui/technical-details";
import { createBrowserEndpoints } from "@/lib/api/browser";
import { CropTwinApiError } from "@/lib/api/errors";
import type { CropTwinEndpoints } from "@/lib/api/endpoints";
import type { WeatherInput } from "@/lib/types/api";
import {
  useWorkflowDispatch,
  useWorkflowState,
} from "@/features/workflow/workflow-context";
import {
  detectWeatherOverrides,
  initialWeatherDate,
  isOptionalWeatherInputField,
  parseWeatherDraft,
  WEATHER_FIELD_LABELS,
  WEATHER_INPUT_FIELDS,
  weatherInputFromSnapshot,
} from "./weather-utils";

export type WeatherPanelEndpoints = Pick<CropTwinEndpoints, "getWeatherSnapshot">;

type WeatherFormValues = Record<keyof WeatherInput, string>;

const EMPTY_WEATHER_VALUES: WeatherFormValues = {
  tmin_c: "",
  tmax_c: "",
  humidity_pct: "",
  wind_speed_mps: "",
  shortwave_radiation_sum_mj_m2: "",
  rainfall_mm: "",
  eto_reference_feed: "",
};

export function WeatherPanel({
  endpoints,
}: {
  endpoints?: WeatherPanelEndpoints;
}) {
  const defaultEndpoints = useMemo(() => createBrowserEndpoints(), []);
  const api = endpoints ?? defaultEndpoints;
  const {
    activeStateId,
    advancementPending,
    session,
    twinUpdatePending,
    waterComputationPending,
    weatherDraft,
    weatherSnapshot,
  } = useWorkflowState();
  const dispatch = useWorkflowDispatch();
  const activeStateRef = useRef(activeStateId);
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestRef = useRef(0);
  const plantingDate = session?.planting_date;
  const [targetDate, setTargetDate] = useState(() => initialWeatherDate(plantingDate));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<CropTwinApiError | string | null>(null);

  useEffect(() => {
    activeStateRef.current = activeStateId;
    requestRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    const timeoutId = window.setTimeout(() => {
      setPending(false);
      setError(null);
      setTargetDate(initialWeatherDate(plantingDate));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [activeStateId, plantingDate]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      requestRef.current += 1;
    };
  }, []);

  async function fetchSnapshot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeStateId || pending) {
      return;
    }
    if (!targetDate) {
      setError("Weather date is required.");
      return;
    }
    if (plantingDate && targetDate < plantingDate) {
      setError("Weather date cannot be before the planting date.");
      return;
    }
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    const requestStateId = activeStateId;
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setPending(true);
    setError(null);
    try {
      const snapshot = await api.getWeatherSnapshot(requestStateId, targetDate, {
        signal: abortController.signal,
      });
      if (activeStateRef.current !== requestStateId || requestRef.current !== requestId) {
        return;
      }
      if (snapshot.state_id !== requestStateId) {
        throw new CropTwinApiError({
          kind: "malformed",
          status: null,
          code: "FRONTEND_MALFORMED_RESPONSE",
          message: "The backend returned weather for a different session.",
        });
      }
      dispatch({
        type: "weatherSnapshotReceived",
        stateId: requestStateId,
        snapshot,
        draft: weatherInputFromSnapshot(snapshot),
      });
    } catch (caught) {
      if (caught instanceof CropTwinApiError && caught.kind === "abort") {
        return;
      }
      if (activeStateRef.current !== requestStateId || requestRef.current !== requestId) {
        return;
      }
      setError(
        caught instanceof CropTwinApiError
          ? caught
          : caught instanceof Error
            ? caught.message
            : "Could not retrieve weather.",
      );
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
      if (activeStateRef.current === requestStateId && requestRef.current === requestId) {
        setPending(false);
      }
    }
  }

  const overrides = detectWeatherOverrides(weatherDraft, weatherSnapshot);
  const overriddenFields = WEATHER_INPUT_FIELDS.filter((field) => overrides[field]);

  return (
    <Panel>
      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div>
          <h2 className="text-xl font-semibold">Weather and irrigation</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
            Retrieve daily weather for the active farm, then review or edit the
            exact values sent to the water-state endpoint.
          </p>
          {!activeStateId ? (
            <div className="mt-4">
              <Notice tone="warning">
                Create or load an active session before requesting weather.
              </Notice>
            </div>
          ) : null}
          <form className="mt-5 grid gap-4" onSubmit={fetchSnapshot}>
            <Field label="Weather date" htmlFor="weather_target_date">
              <Input
                id="weather_target_date"
                min={plantingDate}
                disabled={!activeStateId || pending || waterComputationPending || twinUpdatePending || advancementPending}
                onChange={(event) => setTargetDate(event.currentTarget.value)}
                required
                type="date"
                value={targetDate}
              />
            </Field>
            <Button
              type="submit"
              disabled={!activeStateId || pending || waterComputationPending || twinUpdatePending || advancementPending}
            >
              {pending ? "Retrieving weather" : "Retrieve weather snapshot"}
            </Button>
          </form>
          <div aria-live="polite" className="mt-4 grid gap-3">
            {typeof error === "string" ? <Notice tone="warning">{error}</Notice> : null}
            {error instanceof CropTwinApiError ? <ApiErrorView error={error} /> : null}
            {weatherSnapshot ? (
              <Notice tone="success">
                Weather snapshot loaded for {weatherSnapshot.target_date}.
              </Notice>
            ) : (
              <Notice>Fetch weather or enter reviewed values manually.</Notice>
            )}
          </div>
        </div>
        <div className="min-w-0">
          {weatherSnapshot ? (
            <>
              <DefinitionList
                items={[
                  { term: "Source", description: "Open-Meteo" },
                  { term: "Source timezone", description: weatherSnapshot.source_timezone },
                  { term: "Fetched at", description: weatherSnapshot.fetched_at },
                  { term: "Wind normalized from", description: `${weatherSnapshot.wind_source_height_m} m to ${weatherSnapshot.wind_normalized_height_m} m` },
                ]}
              />
              <TechnicalDetails
                summary="Weather snapshot response"
                json={{
                  state_id: weatherSnapshot.state_id,
                  target_date: weatherSnapshot.target_date,
                  source: weatherSnapshot.source,
                  source_timezone: weatherSnapshot.source_timezone,
                  latitude: weatherSnapshot.latitude,
                  longitude: weatherSnapshot.longitude,
                  tmin_c: weatherSnapshot.tmin_c,
                  tmax_c: weatherSnapshot.tmax_c,
                  humidity_pct: weatherSnapshot.humidity_pct,
                  wind_speed_mps: weatherSnapshot.wind_speed_mps,
                  wind_source_height_m: weatherSnapshot.wind_source_height_m,
                  wind_normalized_height_m: weatherSnapshot.wind_normalized_height_m,
                  rainfall_mm: weatherSnapshot.rainfall_mm,
                  shortwave_radiation_sum_mj_m2:
                    weatherSnapshot.shortwave_radiation_sum_mj_m2,
                  eto_reference_feed: weatherSnapshot.eto_reference_feed,
                  fetched_at: weatherSnapshot.fetched_at,
                }}
              />
            </>
          ) : null}
        </div>
      </div>

      <WeatherDraftForm
        key={activeStateId ?? "inactive"}
        disabled={!activeStateId || waterComputationPending || twinUpdatePending || advancementPending}
        draft={weatherDraft}
        onDraftChange={(draft) => {
          if (activeStateId) {
            dispatch({ type: "weatherDraftChanged", stateId: activeStateId, draft });
          }
        }}
        onDraftInvalid={() => {
          if (activeStateId) {
            dispatch({ type: "weatherDraftInvalidated", stateId: activeStateId });
          }
        }}
        onReset={
          weatherSnapshot
            ? () => dispatch({
                type: "weatherDraftChanged",
                stateId: weatherSnapshot.state_id,
                draft: weatherInputFromSnapshot(weatherSnapshot),
              })
            : undefined
        }
      />
      {overriddenFields.length > 0 ? (
        <Notice tone="warning">
          Manual overrides:{" "}
          {overriddenFields.map((field) => WEATHER_FIELD_LABELS[field]).join(", ")}.
        </Notice>
      ) : weatherSnapshot ? (
        <p className="text-sm text-[var(--color-muted)]">
          Fetched weather values are unchanged.
        </p>
      ) : null}
    </Panel>
  );
}

function WeatherDraftForm({
  disabled,
  draft,
  onDraftChange,
  onDraftInvalid,
  onReset,
}: {
  disabled: boolean;
  draft: WeatherInput | null;
  onDraftChange: (draft: WeatherInput) => void;
  onDraftInvalid: () => void;
  onReset?: () => void;
}) {
  const [values, setValues] = useState<WeatherFormValues>(() =>
    draft ? valuesFromDraft(draft) : EMPTY_WEATHER_VALUES,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!draft) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setValues(valuesFromDraft(draft));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [draft]);

  function updateField(field: keyof WeatherInput, value: string) {
    const nextValues = { ...values, [field]: value };
    setValues(nextValues);
    try {
      const nextDraft = parseWeatherDraft(nextValues);
      setError(null);
      onDraftChange(nextDraft);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Weather values are invalid.");
      onDraftInvalid();
    }
  }

  function resetToFetchedValues() {
    setError(null);
    onReset?.();
  }

  return (
    <div className="mt-6 grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-semibold">Reviewed weather inputs</h3>
        {onReset ? (
          <Button type="button" variant="secondary" onClick={resetToFetchedValues} disabled={disabled}>
            Reset to fetched values
          </Button>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {WEATHER_INPUT_FIELDS.map((field) => (
          <Field key={field} label={WEATHER_FIELD_LABELS[field]} htmlFor={`weather_${field}`}>
            <Input
              disabled={disabled}
              id={`weather_${field}`}
              min={field === "humidity_pct" || field.endsWith("_mm") || field.includes("radiation") || field.includes("wind") ? 0 : undefined}
              max={field === "humidity_pct" ? 100 : undefined}
              onChange={(event) => updateField(field, event.currentTarget.value)}
              required={!isOptionalWeatherInputField(field)}
              step="any"
              type="number"
              value={values[field]}
            />
          </Field>
        ))}
      </div>
      {error ? <Notice tone="warning">{error}</Notice> : null}
      <Notice>
        When sunlight energy is left blank, the backend may use its fallback
        ETo method. Reference ETo is optional and used by the backend only for
        comparison when available.
      </Notice>
    </div>
  );
}

function valuesFromDraft(draft: WeatherInput): WeatherFormValues {
  return {
    tmin_c: String(draft.tmin_c),
    tmax_c: String(draft.tmax_c),
    humidity_pct: String(draft.humidity_pct),
    wind_speed_mps: String(draft.wind_speed_mps),
    shortwave_radiation_sum_mj_m2: String(draft.shortwave_radiation_sum_mj_m2 ?? ""),
    rainfall_mm: String(draft.rainfall_mm),
    eto_reference_feed: String(draft.eto_reference_feed ?? ""),
  };
}

function Field({
  children,
  htmlFor,
  label,
}: {
  children: React.ReactNode;
  htmlFor: string;
  label: string;
}) {
  return (
    <div className="grid gap-1.5">
      <label className="text-sm font-medium" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}

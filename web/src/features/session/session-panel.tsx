"use client";

import { FormEvent, useMemo, useState } from "react";
import { CropTwinApiError } from "@/lib/api/errors";
import { createBrowserEndpoints } from "@/lib/api/browser";
import { buildCreateSessionRequest, SOIL_TEXTURE_OPTIONS } from "@/lib/validation/session";
import type { SessionResponse, SessionStateResponse } from "@/lib/types/api";
import { ApiErrorView } from "@/components/ui/api-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { useWorkflowDispatch } from "@/features/workflow/workflow-context";

export function SessionPanel() {
  const endpoints = useMemo(() => createBrowserEndpoints(), []);
  const dispatch = useWorkflowDispatch();
  const [createResult, setCreateResult] = useState<SessionResponse | null>(null);
  const [loadResult, setLoadResult] = useState<SessionStateResponse | null>(null);
  const [error, setError] = useState<CropTwinApiError | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<"create" | "load" | null>(null);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setSubmitting("create");
    setError(null);
    setLocalError(null);
    try {
      const request = buildCreateSessionRequest(new FormData(event.currentTarget));
      const response = await endpoints.createSession(request);
      setCreateResult(response);
      setLoadResult(null);
      dispatch({ type: "sessionCreated", session: response });
    } catch (caught) {
      setCreateResult(null);
      if (caught instanceof CropTwinApiError) {
        setError(caught);
      } else {
        setLocalError(
          caught instanceof Error ? caught.message : "Could not create session.",
        );
      }
    } finally {
      setSubmitting(null);
    }
  }

  async function handleLoad(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    const stateId = new FormData(event.currentTarget).get("state_id");
    const trimmed = typeof stateId === "string" ? stateId.trim() : "";
    if (!trimmed) {
      setLocalError("State ID is required.");
      return;
    }
    setSubmitting("load");
    setError(null);
    setLocalError(null);
    try {
      const response = await endpoints.getSession(trimmed);
      setLoadResult(response);
      setCreateResult(null);
      dispatch({ type: "sessionLoaded", session: response });
    } catch (caught) {
      setLoadResult(null);
      if (caught instanceof CropTwinApiError) {
        setError(caught);
      } else {
        setLocalError(
          caught instanceof Error ? caught.message : "Could not load session.",
        );
      }
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <Panel>
      <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <h2 className="text-xl font-semibold">Start a CropTwin session</h2>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            Create the base session record. FastAPI still owns elevation
            validation, persistence and all agronomy decisions.
          </p>
          <form className="mt-5 grid gap-4" onSubmit={handleCreate}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Crop type" htmlFor="crop_type">
                <Input id="crop_type" name="crop_type" value="tomato" readOnly />
              </Field>
              <Field label="Planting date" htmlFor="planting_date">
                <Input id="planting_date" name="planting_date" type="date" required />
              </Field>
            </div>
            <Field label="Location name" htmlFor="location_name">
              <Input
                id="location_name"
                name="location_name"
                placeholder="Hyderabad Farm"
                required
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Latitude" htmlFor="latitude">
                <Input id="latitude" name="latitude" type="number" step="any" required />
              </Field>
              <Field label="Longitude" htmlFor="longitude">
                <Input id="longitude" name="longitude" type="number" step="any" required />
              </Field>
              <Field label="Elevation metres" htmlFor="elevation_m" optional>
                <Input id="elevation_m" name="elevation_m" type="number" step="any" />
              </Field>
            </div>
            <Field label="Soil texture" htmlFor="soil_texture">
              <Select id="soil_texture" name="soil_texture" defaultValue="sandy_loam">
                {SOIL_TEXTURE_OPTIONS.map((texture) => (
                  <option key={texture} value={texture}>
                    {texture.replaceAll("_", " ")}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" disabled={submitting !== null}>
              {submitting === "create" ? "Creating" : "Create session"}
            </Button>
          </form>
        </div>

        <div>
          <h2 className="text-xl font-semibold">Load existing session</h2>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            Enter a backend state ID. The frontend will not invent or mock a
            session if FastAPI returns not found.
          </p>
          <form className="mt-5 grid gap-4" onSubmit={handleLoad}>
            <Field label="State ID" htmlFor="state_id">
              <Input id="state_id" name="state_id" placeholder="state-..." required />
            </Field>
            <Button type="submit" variant="secondary" disabled={submitting !== null}>
              {submitting === "load" ? "Loading" : "Load session"}
            </Button>
          </form>
        </div>
      </div>

      <div aria-live="polite" className="mt-6 grid gap-4">
        {localError ? <Notice tone="warning">{localError}</Notice> : null}
        {error ? <ApiErrorView error={error} /> : null}
        {createResult ? (
          <Notice tone="success">
            Created session <strong>{createResult.state_id}</strong> for{" "}
            {createResult.location.name}.
          </Notice>
        ) : null}
        {loadResult ? (
          <Notice tone="success">
            Loaded current state for <strong>{loadResult.state_id}</strong>:{" "}
            {loadResult.current_state.growth_stage.replaceAll("_", " ")} stage.
          </Notice>
        ) : null}
      </div>
    </Panel>
  );
}

function Field({
  children,
  htmlFor,
  label,
  optional = false,
}: {
  children: React.ReactNode;
  htmlFor: string;
  label: string;
  optional?: boolean;
}) {
  return (
    <div className="grid gap-1.5">
      <label className="text-sm font-medium" htmlFor={htmlFor}>
        {label}
        {optional ? (
          <span className="ml-1 text-xs text-[var(--color-muted)]">(optional)</span>
        ) : null}
      </label>
      {children}
    </div>
  );
}

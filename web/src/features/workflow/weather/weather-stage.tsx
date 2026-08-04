"use client";

import { CloudSun, Download, RotateCcw } from "lucide-react";
import { useState } from "react";
import { ApiErrorPanel } from "@/components/shared-states/api-error-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form-controls";
import { useWeatherSnapshot } from "@/lib/api/hooks/use-workflow";
import { acceptedWeatherFromDraft, currentWeatherSignature, validateWeatherDate, valuesFromSnapshot, weatherFields, weatherLabels, type AcceptedWeather, type WeatherDraft, type WeatherField } from "./weather-draft";

export function WeatherStage({ stateId, draft, accepted, onDraftChange, onAccept }: { stateId: string; draft: WeatherDraft; accepted?: AcceptedWeather; onDraftChange: (draft: WeatherDraft) => void; onAccept: (accepted: AcceptedWeather) => void }) {
  const weather = useWeatherSnapshot(stateId, draft.targetDate);
  const [fetchError, setFetchError] = useState<string>();
  const snapshot = weather.data;
  const currentSignature = currentWeatherSignature(stateId, draft, snapshot);
  const stale = Boolean(accepted && accepted.signature !== currentSignature);

  async function fetchWeather() {
    try { validateWeatherDate(draft.targetDate); setFetchError(undefined); }
    catch (error) { setFetchError(error instanceof Error ? error.message : "Choose a valid weather date."); return; }
    const result = await weather.refetch();
    if (result.data) onDraftChange({ targetDate: result.data.target_date, provenance: "fetched_reviewed", values: valuesFromSnapshot(result.data), fetchedIdentity: { stateId: result.data.state_id, targetDate: result.data.target_date, fetchedAt: result.data.fetched_at } });
  }

  function setField(field: WeatherField, value: string) { onDraftChange({ ...draft, values: { ...draft.values, [field]: value } }); }
  function setDate(targetDate: string) { onDraftChange({ ...draft, targetDate, provenance: "manual", fetchedIdentity: undefined }); }

  function accept() {
    if (prepared) onAccept(prepared);
  }

  let validationError: string | undefined;
  let prepared: AcceptedWeather | undefined;
  try { prepared = acceptedWeatherFromDraft(stateId, draft, draft.provenance === "fetched_reviewed" ? snapshot : undefined); } catch (error) { validationError = error instanceof Error ? error.message : "Weather values are invalid."; }
  const overrides = prepared?.overrideFlags;

  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
    <Card><CardHeader><CardTitle>Review weather input</CardTitle><CardDescription>Retrieval is explicit. Review every value, then accept it for later water-state preparation.</CardDescription></CardHeader><CardContent className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end"><Field label="Target date" htmlFor="weather-target-date"><Input id="weather-target-date" type="date" value={draft.targetDate} onChange={(event) => setDate(event.target.value)} /></Field><Button type="button" onClick={() => void fetchWeather()} disabled={weather.isFetching}><Download className="size-4" aria-hidden="true" />{weather.isFetching ? "Retrieving…" : "Retrieve weather"}</Button><Field label="Review provenance" htmlFor="weather-provenance"><Select id="weather-provenance" value={draft.provenance} onChange={(event) => onDraftChange({ ...draft, provenance: event.target.value as WeatherDraft["provenance"], fetchedIdentity: event.target.value === "manual" || !snapshot ? undefined : { stateId: snapshot.state_id, targetDate: snapshot.target_date, fetchedAt: snapshot.fetched_at } })}><option value="fetched_reviewed" disabled={!snapshot}>Fetched and reviewed</option><option value="manual">Fully manual</option></Select></Field></div>
      {fetchError ? <p role="alert" className="text-sm font-semibold text-[var(--state-destructive-strong)]">{fetchError}</p> : null}
      {weather.isError ? <ApiErrorPanel error={weather.error} onRetry={() => void fetchWeather()} title="Weather unavailable" /> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{weatherFields.map((field) => <Field key={field} label={weatherLabels[field]} htmlFor={`weather-${field}`}><Input id={`weather-${field}`} type="number" step="any" value={draft.values[field]} onChange={(event) => setField(field, event.target.value)} /></Field>)}</div>
      {validationError ? <p role="alert" className="text-sm font-semibold text-[var(--state-destructive-strong)]">{validationError}</p> : null}
      {stale ? <Alert variant="warning"><RotateCcw className="size-5" aria-hidden="true" /><AlertTitle>Accepted weather is stale</AlertTitle><AlertDescription>A reviewed value or date changed. Accept the current draft again.</AlertDescription></Alert> : null}
      <Button type="button" className="w-fit" onClick={accept} disabled={Boolean(validationError)}>Accept reviewed weather</Button>
      <p className="text-xs text-[var(--text-muted)]">Prepared for water-state computation. Not submitted to the agronomy engine yet.</p>
    </CardContent></Card>
    <div className="grid content-start gap-5">{draft.provenance === "fetched_reviewed" && snapshot ? <Card><CardHeader><div className="flex items-center gap-2 text-[var(--state-info-strong)]"><CloudSun className="size-5" aria-hidden="true" /><CardTitle>Open-Meteo source</CardTitle></div><CardDescription>Fetched values remain distinct from farmer-reviewed overrides.</CardDescription></CardHeader><CardContent><dl className="grid gap-3 text-sm"><Row term="Source timezone" value={snapshot.source_timezone} /><Row term="Fetched at" value={new Date(snapshot.fetched_at).toLocaleString()} /><Row term="Coordinates" value={`${snapshot.latitude}, ${snapshot.longitude}`} /><Row term="Wind heights" value={`${snapshot.wind_source_height_m} m source → ${snapshot.wind_normalized_height_m} m normalized`} /></dl>{overrides && Object.values(overrides).some(Boolean) ? <p className="mt-4 text-sm font-semibold text-[var(--state-warning-strong)]">Reviewed overrides: {weatherFields.filter((field) => overrides[field]).map((field) => weatherLabels[field]).join(", ")}</p> : <p className="mt-4 text-sm text-[var(--text-muted)]">Reviewed values match the fetched snapshot.</p>}</CardContent></Card> : <Alert variant="neutral"><CloudSun className="size-5" aria-hidden="true" /><AlertTitle>Fully manual weather</AlertTitle><AlertDescription>No source claim or snapshot metadata applies to these farmer-entered values.</AlertDescription></Alert>}{accepted && !stale ? <Alert variant="success"><CloudSun className="size-5" aria-hidden="true" /><AlertTitle>Reviewed weather accepted</AlertTitle><AlertDescription>{accepted.targetDate} · {accepted.provenance === "manual" ? "Fully manual" : "Fetched and reviewed"}. Unsaved browser draft only.</AlertDescription></Alert> : null}</div>
  </div>;
}

function Row({ term, value }: { term: string; value: string }) { return <div><dt className="text-[var(--text-muted)]">{term}</dt><dd className="font-semibold">{value}</dd></div>; }

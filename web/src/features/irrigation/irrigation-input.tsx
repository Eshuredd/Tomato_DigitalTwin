"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import type { LastIrrigationEvent } from "@/lib/types/api";
import {
  buildLastIrrigationEvent,
  dripRuntimeToLitresAndDepth,
  generateIrrigationEventId,
  irrigationDepthFromLitresArea,
  stableIrrigationSignature,
  type IrrigationMode,
} from "./irrigation-utils";

export function IrrigationInput({
  disabled,
  onChange,
}: {
  disabled: boolean;
  onChange: (event: LastIrrigationEvent | null, signature: string) => void;
}) {
  const [mode, setMode] = useState<IrrigationMode>("none");
  const [timestamp, setTimestamp] = useState(defaultDateTimeLocal);
  const [directDepth, setDirectDepth] = useState("0");
  const [totalLitres, setTotalLitres] = useState("0");
  const [litresArea, setLitresArea] = useState("0");
  const [emitterCount, setEmitterCount] = useState("0");
  const [emitterFlow, setEmitterFlow] = useState("0");
  const [runtimeMinutes, setRuntimeMinutes] = useState("0");
  const [dripArea, setDripArea] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const eventIdentityRef = useRef<{ signature: string; eventId: string } | null>(null);

  const currentAmountMm = useCallback((): number => {
    if (mode === "direct") {
      return finiteInput(directDepth, "Irrigation depth (mm)");
    }
    if (mode === "litres_area") {
      return irrigationDepthFromLitresArea({
        totalLitres: finiteInput(totalLitres, "Total water applied (litres)"),
        irrigatedAreaM2: finiteInput(litresArea, "Irrigated area (m2)"),
      });
    }
    return dripRuntimeToLitresAndDepth({
      emitterCount: finiteInput(emitterCount, "Emitter count"),
      emitterFlowLph: finiteInput(emitterFlow, "Emitter flow (litres/hour)"),
      runtimeMinutes: finiteInput(runtimeMinutes, "Runtime (minutes)"),
      irrigatedAreaM2: finiteInput(dripArea, "Irrigated area (m2)"),
    }).amountMm;
  }, [
    directDepth,
    dripArea,
    emitterCount,
    emitterFlow,
    litresArea,
    mode,
    runtimeMinutes,
    totalLitres,
  ]);

  const currentEvent = useCallback((): { event: LastIrrigationEvent | null; signature: string } => {
    if (mode === "none") {
      return { event: null, signature: "none" };
    }
    const amountMm = currentAmountMm();
    const signature = stableIrrigationSignature({
      amountMm,
      mode,
      timestamp,
    });
    if (amountMm === 0) {
      return { event: null, signature };
    }
    if (eventIdentityRef.current?.signature !== signature) {
      eventIdentityRef.current = {
        signature,
        eventId: generateIrrigationEventId(),
      };
    }
    const event = buildLastIrrigationEvent({
      amountMm,
      eventId: eventIdentityRef.current.eventId,
      source:
        mode === "direct"
          ? "MANUAL"
          : mode === "litres_area"
            ? "CONVERTED_FROM_LITRES"
            : "CONVERTED_FROM_DRIP_RUNTIME",
      timestamp,
    });
    return { event, signature };
  }, [
    currentAmountMm,
    mode,
    timestamp,
  ]);

  useEffect(() => {
    let nextError: string | null = null;
    try {
      const result = currentEvent();
      onChange(result.event, result.signature);
    } catch (caught) {
      nextError = caught instanceof Error ? caught.message : "Recent irrigation is invalid.";
      onChange(null, "invalid");
    }
    const timeoutId = window.setTimeout(() => setError(nextError), 0);
    return () => window.clearTimeout(timeoutId);
  }, [
    currentEvent,
    onChange,
  ]);

  return (
    <div className="grid gap-4">
      <h3 className="font-semibold">Recent irrigation</h3>
      <Field label="Input mode" htmlFor="irrigation_mode">
        <Select
          disabled={disabled}
          id="irrigation_mode"
          onChange={(event) => setMode(event.currentTarget.value as IrrigationMode)}
          value={mode}
        >
          <option value="none">No recent irrigation</option>
          <option value="direct">I know the depth in millimetres</option>
          <option value="litres_area">I know total litres and irrigated area</option>
          <option value="drip_runtime">I know drip runtime and emitter details</option>
        </Select>
      </Field>

      {mode !== "none" ? (
        <Field label="Irrigation timestamp" htmlFor="irrigation_timestamp">
          <Input
            disabled={disabled}
            id="irrigation_timestamp"
            onChange={(event) => setTimestamp(event.currentTarget.value)}
            required
            type="datetime-local"
            value={timestamp}
          />
        </Field>
      ) : (
        <Notice>No irrigation event will be sent with the water request.</Notice>
      )}

      {mode === "direct" ? (
        <Field label="Irrigation depth (mm)" htmlFor="irrigation_depth_mm">
          <Input
            disabled={disabled}
            id="irrigation_depth_mm"
            min={0}
            onChange={(event) => setDirectDepth(event.currentTarget.value)}
            required
            step="any"
            type="number"
            value={directDepth}
          />
        </Field>
      ) : null}

      {mode === "litres_area" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Total water applied (litres)" htmlFor="irrigation_total_litres">
            <Input
              disabled={disabled}
              id="irrigation_total_litres"
              min={0}
              onChange={(event) => setTotalLitres(event.currentTarget.value)}
              required
              step="any"
              type="number"
              value={totalLitres}
            />
          </Field>
          <Field label="Irrigated area (m2)" htmlFor="irrigation_area_m2">
            <Input
              disabled={disabled}
              id="irrigation_area_m2"
              min={0}
              onChange={(event) => setLitresArea(event.currentTarget.value)}
              required
              step="any"
              type="number"
              value={litresArea}
            />
          </Field>
        </div>
      ) : null}

      {mode === "drip_runtime" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Emitter count" htmlFor="irrigation_emitter_count">
            <Input disabled={disabled} id="irrigation_emitter_count" min={1} onChange={(event) => setEmitterCount(event.currentTarget.value)} required step={1} type="number" value={emitterCount} />
          </Field>
          <Field label="Emitter flow (litres/hour)" htmlFor="irrigation_emitter_flow">
            <Input disabled={disabled} id="irrigation_emitter_flow" min={0} onChange={(event) => setEmitterFlow(event.currentTarget.value)} required step="any" type="number" value={emitterFlow} />
          </Field>
          <Field label="Runtime (minutes)" htmlFor="irrigation_runtime_minutes">
            <Input disabled={disabled} id="irrigation_runtime_minutes" min={0} onChange={(event) => setRuntimeMinutes(event.currentTarget.value)} required step="any" type="number" value={runtimeMinutes} />
          </Field>
          <Field label="Irrigated area (m2)" htmlFor="irrigation_drip_area">
            <Input disabled={disabled} id="irrigation_drip_area" min={0} onChange={(event) => setDripArea(event.currentTarget.value)} required step="any" type="number" value={dripArea} />
          </Field>
        </div>
      ) : null}

      {error ? <Notice tone="warning">{error}</Notice> : null}
    </div>
  );

}

function defaultDateTimeLocal(): string {
  const now = new Date();
  now.setSeconds(0, 0);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function finiteInput(value: string, fieldName: string): number {
  if (!value.trim()) {
    throw new Error(`${fieldName} is required.`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldName} must be a finite number.`);
  }
  return parsed;
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

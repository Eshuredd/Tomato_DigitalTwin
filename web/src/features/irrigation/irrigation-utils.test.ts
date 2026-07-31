import { describe, expect, it, vi } from "vitest";
import {
  buildLastIrrigationEvent,
  dripRuntimeToLitresAndDepth,
  generateIrrigationEventId,
  irrigationDepthFromLitresArea,
} from "./irrigation-utils";

describe("irrigation conversions", () => {
  it("keeps direct depth as millimetres", () => {
    expect(buildLastIrrigationEvent({
      amountMm: 12.5,
      eventId: "event-1",
      source: "MANUAL",
      timestamp: "2026-07-31T06:00:00Z",
    })).toEqual({
      amount_mm: 12.5,
      irrigation_event_id: "event-1",
      source: "MANUAL",
      timestamp: "2026-07-31T06:00:00.000Z",
    });
  });

  it("converts litres over area to millimetres", () => {
    expect(irrigationDepthFromLitresArea({
      totalLitres: 100,
      irrigatedAreaM2: 20,
    })).toBe(5);
  });

  it("converts drip runtime to total litres and millimetres", () => {
    expect(dripRuntimeToLitresAndDepth({
      emitterCount: 10,
      emitterFlowLph: 2,
      runtimeMinutes: 30,
      irrigatedAreaM2: 5,
    })).toEqual({
      runtimeHours: 0.5,
      totalLitres: 10,
      amountMm: 2,
    });
  });

  it("rejects invalid conversion inputs", () => {
    expect(() => irrigationDepthFromLitresArea({
      totalLitres: 100,
      irrigatedAreaM2: 0,
    })).toThrow("greater than 0");
    expect(() => dripRuntimeToLitresAndDepth({
      emitterCount: 1.5,
      emitterFlowLph: 2,
      runtimeMinutes: 30,
      irrigatedAreaM2: 5,
    })).toThrow("positive integer");
  });

  it("does not create an event for zero depth", () => {
    expect(buildLastIrrigationEvent({
      amountMm: 0,
      eventId: "event-1",
      source: "MANUAL",
      timestamp: "2026-07-31T06:00",
    })).toBeNull();
  });

  it("uses randomUUID when available", () => {
    const randomUUID = vi.fn(() => "stable-event-id");
    vi.stubGlobal("crypto", { randomUUID });
    expect(generateIrrigationEventId()).toBe("stable-event-id");
    vi.unstubAllGlobals();
  });
});

import { describe, expect, it, vi } from "vitest";
import { awareIsoFromLocalDateTime, initialWeatherDate, isCanonicalLocalDate, localDateInputValue, localDateTimeInputValue } from "./local-date";

function localDateWithParts(year: number, monthIndex: number, day: number) {
  const date = new Date("2025-12-31T19:00:00.000Z");
  vi.spyOn(date, "getFullYear").mockReturnValue(year);
  vi.spyOn(date, "getMonth").mockReturnValue(monthIndex);
  vi.spyOn(date, "getDate").mockReturnValue(day);
  return date;
}

describe("localDateInputValue", () => {
  it("formats an ordinary local calendar date", () => {
    expect(localDateInputValue(new Date(2026, 7, 4, 12, 0, 0))).toBe("2026-08-04");
  });

  it("pads single-digit months and days", () => {
    expect(localDateInputValue(new Date(2026, 0, 2, 12, 0, 0))).toBe("2026-01-02");
  });

  it("uses local date getters at a boundary where the UTC date differs", () => {
    const boundary = localDateWithParts(2026, 0, 1);
    expect(boundary.toISOString().slice(0, 10)).toBe("2025-12-31");
    expect(localDateInputValue(boundary)).toBe("2026-01-01");
  });

  it("chooses a future authoritative planting date for weather", () => {
    expect(initialWeatherDate("2026-08-10", "2026-08-04")).toBe("2026-08-10");
    expect(initialWeatherDate("2026-07-01", "2026-08-04")).toBe("2026-08-04");
  });

  it("rejects impossible calendar dates", () => {
    expect(isCanonicalLocalDate("2026-02-30")).toBe(false);
    expect(isCanonicalLocalDate("2026-02-28")).toBe(true);
  });

  it("formats the current local minute and converts it as an absolute instant", () => {
    const date = new Date(2026, 7, 4, 10, 7, 59);
    const local = localDateTimeInputValue(date);
    expect(local).toBe("2026-08-04T10:07");
    expect(awareIsoFromLocalDateTime(local)).toBe(new Date(2026, 7, 4, 10, 7).toISOString());
  });

  it("rejects invalid local date-time values", () => {
    expect(() => awareIsoFromLocalDateTime("2026-02-30T10:00")).toThrow();
    expect(() => awareIsoFromLocalDateTime("")).toThrow();
  });
});

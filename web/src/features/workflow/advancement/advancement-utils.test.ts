import { describe, expect, it } from "vitest";
import type { AdvanceOneDayResponse } from "@/lib/api/contracts";
import { advancementPayloadSignature, classifyAdvancement, deriveNextAdvancementDate } from "./advancement-utils";
const response = { advancement_created: false, water_state: { water_sequence: 2 } } as AdvanceOneDayResponse;
const weather = { tmin_c: 20, tmax_c: 30, humidity_pct: 50, wind_speed_mps: 1, rainfall_mm: 0 };
describe("one-day advancement", () => {
  it.each([["2026-07-31T00:00:00Z", "2026-08-01"], ["2026-12-31T23:00:00Z", "2027-01-01"], ["2028-02-28T00:00:00Z", "2028-02-29"]])("adds exactly one UTC date to %s", (input, expected) => expect(deriveNextAdvancementDate(input)).toBe(expected));
  it("rejects malformed observed timestamps", () => expect(deriveNextAdvancementDate("2026-08-01")).toBeUndefined());
  it("creates stable signatures independent of weather key order", () => expect(advancementPayloadSignature("state", "2026-08-05", weather, null)).toBe(advancementPayloadSignature("state", "2026-08-05", { rainfall_mm: 0, wind_speed_mps: 1, humidity_pct: 50, tmax_c: 30, tmin_c: 20 }, null)));
  it("classifies new, current, catch-up and historical transitions", () => { expect(classifyAdvancement({ ...response, advancement_created: true }, 1)).toBe("new_advancement"); expect(classifyAdvancement(response, 2)).toBe("current_retry"); expect(classifyAdvancement(response, 1)).toBe("catch_up_retry"); expect(classifyAdvancement(response, 3)).toBe("historical_retry"); });
});

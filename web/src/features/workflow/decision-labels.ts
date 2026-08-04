import type { Action } from "@/lib/api/contracts";

export const actionLabels: Record<Action, string> = {
  IRRIGATE_NOW: "Irrigate now",
  IRRIGATE_IN_6H: "Irrigate in 6 hours",
  IRRIGATE_TOMORROW_AM: "Irrigate tomorrow morning",
  NO_IRRIGATION_24H: "No irrigation for 24 hours",
};

export function readableCode(code: string) { return code.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()); }

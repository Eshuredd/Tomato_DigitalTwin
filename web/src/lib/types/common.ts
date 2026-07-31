export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type AsyncStatus =
  | "idle"
  | "checking"
  | "connected"
  | "unavailable"
  | "timeout"
  | "malformed";

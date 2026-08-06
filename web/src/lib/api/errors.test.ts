import { describe, expect, it } from "vitest";
import { parseBackendError } from "./errors";

describe("parseBackendError", () => {
  it("maps the FastAPI error envelope without losing details", () => {
    const error = parseBackendError({ error: { status_code: 409, code: "INCOMPLETE_STATE", message: "State is incomplete.", details: { missing: ["water"] } } }, 409);
    expect(error).toMatchObject({ kind: "backend", code: "INCOMPLETE_STATE", statusCode: 409, details: { missing: ["water"] } });
  });

  it("rejects unstructured payloads", () => expect(parseBackendError({ detail: "invalid" }, 422)).toBeNull());
});

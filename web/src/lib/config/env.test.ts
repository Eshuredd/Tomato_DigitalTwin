import { describe, expect, it } from "vitest";
import { normalizeApiBaseUrl } from "./env";

describe("normalizeApiBaseUrl", () => {
  it("uses the development default when absent", () => {
    expect(normalizeApiBaseUrl(undefined)).toBe("http://127.0.0.1:8000");
  });

  it("rejects empty values", () => {
    expect(() => normalizeApiBaseUrl("   ")).toThrow(/must not be empty/);
  });

  it("removes trailing slashes after trimming", () => {
    expect(normalizeApiBaseUrl(" http://127.0.0.1:8000/ ")).toBe("http://127.0.0.1:8000");
    expect(normalizeApiBaseUrl("https://example.com/api///")).toBe("https://example.com/api");
  });

  it("rejects non-http URLs", () => {
    expect(() => normalizeApiBaseUrl("ftp://example.com")).toThrow(/HTTP or HTTPS/);
  });
});

import { describe, expect, it } from "vitest";
import { fileToRawBase64, validateDiseaseFiles } from "./disease-files";

const file = (type: string, size = 3) => new File([new Uint8Array(size)], "leaf", { type });

describe("disease image boundaries", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])("accepts one %s image", (type) => expect(validateDiseaseFiles([file(type)]).error).toBeNull());
  it("rejects no file", () => expect(validateDiseaseFiles([]).error).toMatch(/one tomato leaf/i));
  it("rejects multiple files", () => expect(validateDiseaseFiles([file("image/png"), file("image/png")]).error).toMatch(/only one/i));
  it("rejects empty files", () => expect(validateDiseaseFiles([file("image/png", 0)]).error).toMatch(/non-empty/i));
  it("rejects unsupported MIME types", () => expect(validateDiseaseFiles([file("image/gif")]).error).toMatch(/JPEG, PNG, or WebP/i));
  it("rejects files larger than 10 MiB", () => expect(validateDiseaseFiles([file("image/png", 10 * 1024 * 1024 + 1)]).error).toMatch(/10 MiB/i));
  it("produces raw base64 without a data URL prefix", async () => {
    const value = await fileToRawBase64(new File(["abc"], "leaf.png", { type: "image/png" }));
    expect(value).toBe("YWJj");
    expect(value).not.toContain("data:");
  });
});

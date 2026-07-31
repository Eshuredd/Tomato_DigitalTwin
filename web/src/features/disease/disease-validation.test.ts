import { describe, expect, it } from "vitest";
import {
  formatFileSize,
  MAX_DISEASE_IMAGE_BYTES,
  validateDiseaseImageFiles,
} from "./disease-validation";

function file(name: string, type: string, size = 4): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe("disease image validation", () => {
  it.each([
    ["leaf.jpg", "image/jpeg"],
    ["leaf.png", "image/png"],
    ["leaf.webp", "image/webp"],
  ])("accepts %s", (name, type) => {
    expect(validateDiseaseImageFiles([file(name, type)]).error).toBeNull();
  });

  it("rejects unsupported types", () => {
    expect(validateDiseaseImageFiles([file("leaf.gif", "image/gif")]).error).toMatch(/JPEG, PNG, or WebP/);
  });

  it("rejects oversized and empty files", () => {
    expect(validateDiseaseImageFiles([file("big.jpg", "image/jpeg", MAX_DISEASE_IMAGE_BYTES + 1)]).error).toMatch(/10.0 MB/);
    expect(validateDiseaseImageFiles([file("empty.jpg", "image/jpeg", 0)]).error).toMatch(/non-empty/);
  });

  it("rejects missing and multiple files", () => {
    expect(validateDiseaseImageFiles([]).error).toMatch(/Select one/);
    expect(validateDiseaseImageFiles([
      file("one.jpg", "image/jpeg"),
      file("two.jpg", "image/jpeg"),
    ]).error).toMatch(/only one/);
  });

  it("formats readable file sizes", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(2048)).toBe("2.0 KB");
    expect(formatFileSize(MAX_DISEASE_IMAGE_BYTES)).toBe("10.0 MB");
  });
});

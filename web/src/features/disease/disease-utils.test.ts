import { describe, expect, it, vi } from "vitest";
import { fileToBase64, humanizeDiseaseLabel, topClassProbabilities } from "./disease-utils";

describe("disease utils", () => {
  it("encodes files to raw base64", async () => {
    const encoded = await fileToBase64(new File([new Uint8Array([1, 2, 3])], "leaf.jpg", { type: "image/jpeg" }));

    expect(encoded).toBe("AQID");
    expect(encoded).not.toContain("data:image");
  });

  it("rejects empty files", async () => {
    await expect(fileToBase64(new File([], "empty.jpg", { type: "image/jpeg" }))).rejects.toThrow("non-empty");
  });

  it("rejects FileReader failures", async () => {
    class FailingFileReader {
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      result: string | null = null;

      readAsDataURL() {
        this.onerror?.();
      }
    }
    vi.stubGlobal("FileReader", FailingFileReader);

    await expect(fileToBase64(new File(["x"], "leaf.jpg", { type: "image/jpeg" }))).rejects.toThrow("Could not read");
  });

  it("humanizes labels and sorts probabilities for display only", () => {
    expect(humanizeDiseaseLabel("Tomato___Late_blight")).toBe("Late blight");
    expect(topClassProbabilities({ low: 0.1, high: 0.9 }, 1)).toEqual([["high", 0.9]]);
  });
});

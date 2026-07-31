export const DISEASE_MODEL_VERSION = "1.0";
export const DISEASE_REQUEST_TIMEOUT_MS = 120_000;

export function humanizeDiseaseLabel(label: string): string {
  if (label.trim().toUpperCase() === "UNKNOWN") {
    return "Unknown";
  }
  const cleaned = label.replace(/^Tomato___/, "").replaceAll("_", " ").trim();
  return cleaned.split(/\s+/).join(" ");
}

export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  return `${(value * 100).toFixed(digits)}%`;
}

export function topClassProbabilities(
  classProbs: Record<string, number>,
  limit = 3,
): [string, number][] {
  return Object.entries(classProbs)
    .sort((first, second) => second[1] - first[1])
    .slice(0, limit);
}

export async function fileToBase64(file: File): Promise<string> {
  if (file.size === 0) {
    throw new Error("Select a non-empty image file.");
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the selected image."));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Could not read the selected image."));
        return;
      }
      const marker = ";base64,";
      const markerIndex = result.indexOf(marker);
      resolve(markerIndex >= 0 ? result.slice(markerIndex + marker.length) : result);
    };
    reader.readAsDataURL(file);
  });
}

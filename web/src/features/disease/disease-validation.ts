export const MAX_DISEASE_IMAGE_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_DISEASE_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const DISEASE_IMAGE_ACCEPT = ACCEPTED_DISEASE_IMAGE_TYPES.join(",");

export type AcceptedDiseaseImageType = typeof ACCEPTED_DISEASE_IMAGE_TYPES[number];

export interface ImageValidationResult {
  file: File | null;
  error: string | null;
}

export function validateDiseaseImageFiles(files: readonly File[]): ImageValidationResult {
  if (files.length === 0) {
    return { file: null, error: "Select one tomato leaf image." };
  }
  if (files.length > 1) {
    return { file: null, error: "Select only one image." };
  }
  const [file] = files;
  if (file.size === 0) {
    return { file: null, error: "Select a non-empty image file." };
  }
  if (!isAcceptedDiseaseImageType(file.type)) {
    return {
      file: null,
      error: "Use a JPEG, PNG, or WebP image.",
    };
  }
  if (file.size > MAX_DISEASE_IMAGE_BYTES) {
    return {
      file: null,
      error: `Image must be ${formatFileSize(MAX_DISEASE_IMAGE_BYTES)} or smaller.`,
    };
  }
  return { file, error: null };
}

export function isAcceptedDiseaseImageType(
  value: string,
): value is AcceptedDiseaseImageType {
  return (ACCEPTED_DISEASE_IMAGE_TYPES as readonly string[]).includes(value);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kib = bytes / 1024;
  if (kib < 1024) {
    return `${kib.toFixed(1)} KB`;
  }
  return `${(kib / 1024).toFixed(1)} MB`;
}

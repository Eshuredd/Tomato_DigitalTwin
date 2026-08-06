export const MAX_DISEASE_IMAGE_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_DISEASE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const DISEASE_IMAGE_ACCEPT = ACCEPTED_DISEASE_IMAGE_TYPES.join(",");

export function validateDiseaseFiles(files: readonly File[]) {
  if (files.length === 0) return { file: null, error: "Select one tomato leaf image." };
  if (files.length > 1) return { file: null, error: "Select only one image." };
  const file = files[0];
  if (file.size === 0) return { file: null, error: "Select a non-empty image file." };
  if (!(ACCEPTED_DISEASE_IMAGE_TYPES as readonly string[]).includes(file.type)) return { file: null, error: "Use a JPEG, PNG, or WebP image." };
  if (file.size > MAX_DISEASE_IMAGE_BYTES) return { file: null, error: "Image must be 10 MiB or smaller." };
  return { file, error: null };
}

export function diseaseFileSignature(file: File) {
  return `${file.name}:${file.type}:${file.size}:${file.lastModified}`;
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export function fileToRawBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the selected image."));
    reader.onload = () => {
      if (typeof reader.result !== "string") return reject(new Error("Could not read the selected image."));
      const marker = ";base64,";
      const index = reader.result.indexOf(marker);
      resolve(index >= 0 ? reader.result.slice(index + marker.length) : reader.result);
    };
    reader.readAsDataURL(file);
  });
}

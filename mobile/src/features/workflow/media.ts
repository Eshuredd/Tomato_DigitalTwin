import type { ImagePickerResult } from 'expo-image-picker';

export const MAX_DISEASE_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_DISEASE_IMAGE_PIXELS = 25_000_000;
export interface DiseaseImageDraft { stateId: string; uri: string; base64: string; width: number; height: number }

export function rawBase64(value: string): string { const marker = ';base64,'; const trimmed = value.trim(); const index = trimmed.indexOf(marker); return index >= 0 ? trimmed.slice(index + marker.length) : trimmed; }
export function decodedBase64Bytes(value: string): number { const clean = rawBase64(value).replace(/\s/g, ''); const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0; return Math.max(0, Math.floor(clean.length * 3 / 4) - padding); }
export function imageDraftFromPicker(stateId: string, result: ImagePickerResult): DiseaseImageDraft | undefined {
  if (result.canceled) return undefined;
  const asset = result.assets[0]; const base64 = asset?.base64 ? rawBase64(asset.base64) : '';
  if (!asset?.uri || !base64) throw new Error('The selected image could not be prepared for prediction.');
  if (decodedBase64Bytes(base64) > MAX_DISEASE_IMAGE_BYTES) throw new Error('Image must be 10 MiB or smaller.');
  if (asset.width * asset.height > MAX_DISEASE_IMAGE_PIXELS) throw new Error('Image must contain 25 million pixels or fewer.');
  return { stateId, uri: asset.uri, base64, width: asset.width, height: asset.height };
}
export function imageDraftMatchesSession(draft: DiseaseImageDraft | undefined, stateId: string): draft is DiseaseImageDraft { return Boolean(draft && draft.stateId === stateId); }

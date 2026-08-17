import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { EmptyState, ErrorState, LoadingState, MetricRow, PrimaryButton, SecondaryButton, SectionCard, StatusBadge, TechnicalDetails } from '@/components/ui';
import { toUserFacingError } from '@/lib/api';
import { colors, radii, spacing, typography } from '@/lib/theme';
import { useClearDiseaseEvidence, useDiseaseEvidence, usePredictDisease, useSystemInfo } from './hooks';
import { imageDraftFromPicker, imageDraftMatchesSession, type DiseaseImageDraft } from './media';

export function DiseaseWorkflow({ stateId }: { stateId: string }) {
  const [draft, setDraft] = useState<DiseaseImageDraft>(); const [mediaError, setMediaError] = useState<string>();
  const system = useSystemInfo(); const prediction = usePredictDisease(stateId); const evidence = useDiseaseEvidence(stateId);
  const clearEvidence = useClearDiseaseEvidence(stateId);
  const modelVersion = system.data?.disease_model.model_version;
  function applyResult(result: ImagePicker.ImagePickerResult) { const next = imageDraftFromPicker(stateId, result); if (!next) return; setDraft(next); setMediaError(undefined); prediction.reset(); clearEvidence(); }
  async function choose(source: 'camera' | 'library') {
    setMediaError(undefined);
    try {
      const permission = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { setMediaError(source === 'camera' ? 'Camera access was denied. Enable camera permission in device settings or choose a library image.' : 'Photo access was denied. Enable photo permission in device settings.'); return; }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], base64: true, quality: 0.85, allowsEditing: false };
      applyResult(source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options));
    } catch (error) { setMediaError(error instanceof Error ? error.message : 'The image source is unavailable on this device.'); }
  }
  function clear() { setDraft(undefined); setMediaError(undefined); prediction.reset(); clearEvidence(); }
  function submit() { if (!imageDraftMatchesSession(draft, stateId) || !modelVersion) return; prediction.mutate({ input: { state_id: stateId, image_base64: draft.base64, model_version: modelVersion } }); }
  const apiError = prediction.error ? toUserFacingError(prediction.error) : undefined;
  return <SectionCard title="Disease evidence" accent="ai"><Text style={styles.evidenceLabel}>Supporting AI evidence — not a confirmed diagnosis</Text><Text style={styles.body}>Capture or choose one tomato-leaf image. It stays on this screen until explicitly submitted.</Text>
    <View style={styles.actions}><SecondaryButton accessibilityLabel="Take leaf photo" disabled={prediction.isPending} onPress={() => void choose('camera')}>Use camera</SecondaryButton><SecondaryButton accessibilityLabel="Choose leaf image" disabled={prediction.isPending} onPress={() => void choose('library')}>Photo library</SecondaryButton></View>
    {mediaError ? <ErrorState title="Image unavailable" description={mediaError} /> : null}
    {draft ? <View style={styles.preview}><Image accessibilityLabel="Selected tomato leaf preview" source={{ uri: draft.uri }} contentFit="cover" style={styles.image} /><View style={styles.actions}><SecondaryButton disabled={prediction.isPending} onPress={() => void choose('library')}>Replace image</SecondaryButton><SecondaryButton disabled={prediction.isPending} onPress={clear}>Remove image</SecondaryButton></View></View> : <EmptyState title="No leaf image selected" description="Camera and photo permissions are requested only when you choose those actions." />}
    {system.isPending ? <LoadingState label="Loading supported disease model" /> : system.isError ? <ErrorState title="Disease model metadata unavailable" description="CropTwin could not retrieve the authoritative model version." onRetry={() => void system.refetch()} technicalDetails={toUserFacingError(system.error).technicalDetails} /> : null}
    <PrimaryButton disabled={!draft || !modelVersion || prediction.isPending} onPress={submit}>{prediction.isPending ? 'Running prediction…' : 'Run disease prediction'}</PrimaryButton>
    {apiError ? <ErrorState title="Disease evidence unavailable" description={apiError.description} technicalDetails={apiError.technicalDetails} /> : null}
    {evidence.data ? <DiseaseResult evidence={evidence.data.response} modelVersion={evidence.data.modelVersion} /> : <EmptyState title="No returned disease evidence" description="Only an actual FastAPI prediction response will appear here." />}
  </SectionCard>;
}

function DiseaseResult({ evidence, modelVersion }: { evidence: NonNullable<ReturnType<typeof useDiseaseEvidence>['data']>['response']; modelVersion: string }) { const probabilities = Object.entries(evidence.class_probs).sort((a, b) => b[1] - a[1]); return <SectionCard title={evidence.predicted_label.replace(/^Tomato___/, '').replaceAll('_', ' ')} accent="ai"><StatusBadge tone="ai" label="AI supporting evidence" /><MetricRow label="Category" value={evidence.disease_category} /><MetricRow label="Confidence" value={`${(evidence.confidence_calibrated * 100).toFixed(1)}%`} /><MetricRow label="Uncertainty" value={evidence.uncertainty_band} /><MetricRow label="Uncertainty score" value={evidence.uncertainty_score} /><Text style={styles.heading}>Class probabilities</Text>{probabilities.map(([label, probability]) => <MetricRow key={label} label={label.replace(/^Tomato___/, '').replaceAll('_', ' ')} value={`${(probability * 100).toFixed(1)}%`} />)}<TechnicalDetails details={{ state_id: evidence.state_id, model_version: modelVersion, predicted_at: evidence.predicted_at }} /></SectionCard>; }
const styles = StyleSheet.create({ evidenceLabel: { ...typography.label, color: colors.aiEvidence, textTransform: 'uppercase' }, body: { ...typography.body, color: colors.textSecondary }, heading: { ...typography.heading, color: colors.textPrimary }, actions: { gap: spacing.sm }, preview: { gap: spacing.md }, image: { width: '100%', aspectRatio: 4 / 3, maxHeight: 280, borderRadius: radii.md, backgroundColor: colors.background } });

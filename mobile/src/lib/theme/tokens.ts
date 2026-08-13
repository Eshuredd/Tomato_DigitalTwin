import type { ViewStyle } from 'react-native';

export const colors = {
  background: '#F4F7F1', surface: '#FFFFFF', surfaceElevated: '#FBFCF9',
  textPrimary: '#172019', textSecondary: '#5C685E', border: '#D8E0D5',
  agronomy: '#2F6B45', agronomySoft: '#E2EFE5', aiEvidence: '#65558F', aiEvidenceSoft: '#EEE9F7',
  success: '#287A4B', warning: '#9B6516', destructive: '#B33A3A', information: '#2D6487',
  uncertaintyLow: '#3C7A52', uncertaintyMedium: '#A16A16', uncertaintyHigh: '#77558F', white: '#FFFFFF',
} as const;

export const semanticColorLabels = {
  agronomy: 'Deterministic agronomy', aiEvidence: 'AI supporting evidence',
  uncertaintyLow: 'Low uncertainty', uncertaintyMedium: 'Medium uncertainty', uncertaintyHigh: 'High uncertainty',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radii = { sm: 8, md: 12, lg: 18, pill: 999 } as const;
export const typography = {
  display: { fontSize: 30, lineHeight: 36, fontWeight: '700' as const },
  title: { fontSize: 21, lineHeight: 27, fontWeight: '700' as const },
  heading: { fontSize: 17, lineHeight: 23, fontWeight: '700' as const },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' as const },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600' as const },
  caption: { fontSize: 12, lineHeight: 17, fontWeight: '400' as const },
} as const;
export const shadows: Record<'card', ViewStyle> = {
  card: { shadowColor: '#172019', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2 },
};

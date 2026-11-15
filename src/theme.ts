export const colors = {
  bg: '#07070B',
  surface: '#14141C',
  surfaceHi: '#1F1F2B',
  border: '#2A2A38',
  text: '#FFFFFF',
  muted: '#A1A1B5',
  faint: '#5C5C70',
  yellow: '#FFD23F',
  pink: '#FF2E88',
  cyan: '#2EE6FF',
  green: '#3DDC84',
  red: '#FF4D4D',
};

export const radius = { sm: 10, md: 16, lg: 24, pill: 999 };

export const type = {
  hero: { fontSize: 56, fontWeight: '900' as const, letterSpacing: -2, color: colors.text },
  title: { fontSize: 34, fontWeight: '900' as const, letterSpacing: -1, color: colors.text },
  heading: { fontSize: 22, fontWeight: '800' as const, color: colors.text },
  body: { fontSize: 17, fontWeight: '500' as const, color: colors.text, lineHeight: 24 },
  small: { fontSize: 14, fontWeight: '600' as const, color: colors.muted },
  label: { fontSize: 12, fontWeight: '800' as const, letterSpacing: 1.5, color: colors.muted, textTransform: 'uppercase' as const },
};

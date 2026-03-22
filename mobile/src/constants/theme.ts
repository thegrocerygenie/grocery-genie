export const colors = {
  light: {
    primary: '#2D7A4F',
    primaryLight: '#E8F5EE',
    success: '#34A853',
    successLight: '#E6F4EA',
    warning: '#F9AB00',
    warningLight: '#FEF7E0',
    danger: '#EA4335',
    dangerLight: '#FCE8E6',
    background: '#F8F9FA',
    surface: '#FFFFFF',
    textPrimary: '#1A1A2E',
    textSecondary: '#6B7280',
    border: '#E5E7EB',
    disabled: '#9CA3AF',
  },
  dark: {
    primary: '#4ADE80',
    primaryLight: '#1A3A2A',
    success: '#4ADE80',
    successLight: '#1A3A2A',
    warning: '#FBBF24',
    warningLight: '#3A2F1A',
    danger: '#F87171',
    dangerLight: '#3A1A1A',
    background: '#0F172A',
    surface: '#1E293B',
    textPrimary: '#F1F5F9',
    textSecondary: '#94A3B8',
    border: '#334155',
    disabled: '#475569',
  },
} as const;

export const typography = {
  display: { fontSize: 28, fontWeight: '700' as const, lineHeight: 34 },
  sectionHeader: { fontSize: 20, fontWeight: '600' as const, lineHeight: 28 },
  body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
  bodyBold: { fontSize: 16, fontWeight: '600' as const, lineHeight: 24 },
  caption: { fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
  money: {
    fontSize: 16,
    fontWeight: '600' as const,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  moneyLarge: {
    fontSize: 28,
    fontWeight: '700' as const,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const borderRadius = {
  sm: 6,
  md: 12,
  lg: 16,
  full: 9999,
} as const;

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  elevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
} as const;

export const touchTarget = {
  minHeight: 44,
  minWidth: 44,
} as const;

/**
 * Grocery Genie — Design tokens.
 * Mirrors design_handoff_grocery_genie/reference/tokens-v2.css.
 *
 * Use these instead of inlining hex/numbers. iOS-first; Android falls
 * back where SF Symbols / chrome-material blur aren't available.
 */

import { Platform, type TextStyle } from 'react-native';

export const colors = {
  iosBg: Platform.select({ ios: 'systemGroupedBackground', default: '#F2F2F7' }),
  iosBg2: '#FFFFFF',
  iosBg3: '#F2F2F7',
  iosFill1: 'rgba(120,120,128,0.20)',
  iosFill3: 'rgba(120,120,128,0.12)',
  iosSeparator: 'rgba(60,60,67,0.29)',
  iosLabel: '#000000',
  iosLabel2: 'rgba(60,60,67,0.60)',
  iosLabel3: 'rgba(60,60,67,0.30)',

  tint: '#1F7A4A',
  tintPressed: '#195F3A',
  tintBg: 'rgba(31,122,74,0.12)',

  red: '#FF3B30',
  orange: '#FF9500',
  yellow: '#FFCC00',
  green: '#34C759',
  blue: '#007AFF',
  indigo: '#5856D6',
  pink: '#FF2D55',
  teal: '#30B0C7',
  gray: '#8E8E93',

  cat: {
    groceries: '#34C759',
    household: '#007AFF',
    personalCare: '#FF2D55',
    beverages: '#5856D6',
    snacks: '#FF9500',
    babyKids: '#FFCC00',
    pet: '#30B0C7',
    other: '#8E8E93',
  },
} as const;

export const radii = {
  card: 10,
  list: 10,
  sheet: 22,
  button: 12,
  cap: 9999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

const money: TextStyle = {
  fontFamily: Platform.select({ ios: 'SF Pro Rounded', default: 'System' }),
  fontVariant: ['tabular-nums'],
  fontWeight: '700',
};

export const type = {
  largeTitle: { fontSize: 34, fontWeight: '700', letterSpacing: 0.36 } as TextStyle,
  title1: { fontSize: 28, fontWeight: '700' } as TextStyle,
  title2: { fontSize: 22, fontWeight: '700' } as TextStyle,
  title3: { fontSize: 20, fontWeight: '600' } as TextStyle,
  headline: { fontSize: 17, fontWeight: '600' } as TextStyle,
  body: { fontSize: 17, fontWeight: '400' } as TextStyle,
  callout: { fontSize: 16, fontWeight: '400' } as TextStyle,
  subheadline: { fontSize: 15, fontWeight: '400' } as TextStyle,
  footnote: { fontSize: 13, fontWeight: '400' } as TextStyle,
  caption1: { fontSize: 12, fontWeight: '400' } as TextStyle,
  caption2: { fontSize: 11, fontWeight: '400' } as TextStyle,
  money,
} as const;

export const springs = {
  ring: { damping: 18, stiffness: 90 },
  ui: { damping: 22, stiffness: 220 },
  interactive: { damping: 26, stiffness: 300 },
} as const;

export const touchTarget = {
  minHeight: 44,
  minWidth: 44,
} as const;

/**
 * Grocery Genie — Design tokens.
 * Mirrors design_handoff_grocery_genie/reference/tokens-v2.css.
 *
 * Use these instead of inlining hex/numbers. iOS-first; Android falls
 * back where SF Symbols / chrome-material blur aren't available.
 */

import { DarkTheme, DefaultTheme, type Theme } from '@react-navigation/native';
import {
  DynamicColorIOS,
  Platform,
  PlatformColor,
  type ColorValue,
  type TextStyle,
} from 'react-native';

/** Brand green per appearance, for the few APIs that take only a string. */
export const TINT_HEX = { light: '#1F7A4A', dark: '#34D17A' } as const;

/** An iOS semantic color: follows light and dark mode, and accessibility contrast. */
const system = (name: string): ColorValue => PlatformColor(name);
/** A color iOS has no semantic name for, given for each appearance. */
const pair = (light: string, dark: string): ColorValue => DynamicColorIOS({ light, dark });

/**
 * Every token adapts to dark mode (app.json userInterfaceStyle: automatic).
 * The light values equal the earlier hex palette; dark values are iOS's own,
 * or tokens-v2.css [data-theme="dark"] where iOS has no name (brand tint).
 */
export const colors = {
  iosBg: system('systemGroupedBackground'),
  iosBg2: system('secondarySystemGroupedBackground'),
  iosBg3: system('tertiarySystemGroupedBackground'),
  iosFill1: system('systemFill'),
  iosFill3: system('tertiarySystemFill'),
  iosSeparator: system('separator'),
  iosLabel: system('label'),
  iosLabel2: system('secondaryLabel'),
  iosLabel3: system('tertiaryLabel'),

  // Increase Contrast: darker in light mode (design motion.jsx), brighter in dark.
  tint: DynamicColorIOS({
    light: TINT_HEX.light,
    dark: TINT_HEX.dark,
    highContrastLight: '#195F3A',
    highContrastDark: '#6BE59E',
  }),
  tintPressed: pair('#195F3A', '#2BB86A'),
  tintBg: pair('rgba(31,122,74,0.12)', 'rgba(52,209,122,0.18)'),

  red: system('systemRed'),
  orange: system('systemOrange'),
  yellow: system('systemYellow'),
  green: system('systemGreen'),
  blue: system('systemBlue'),
  indigo: system('systemIndigo'),
  pink: system('systemPink'),
  teal: system('systemTeal'),
  gray: system('systemGray'),
  /** systemOrange at 12% (20% in dark) — warning banner background. */
  orangeBg: pair('rgba(255,149,0,0.12)', 'rgba(255,159,10,0.20)'),
  /** systemRed at 12% (20% in dark) — error and over-budget banners. */
  redBg: pair('rgba(255,59,48,0.12)', 'rgba(255,69,58,0.20)'),
  /** Text and glyphs on a brand-green fill: white, black on the brighter dark-mode green. */
  onTint: pair('#FFFFFF', '#000000'),
  /** systemRed at 40% — the border of a field with an error. */
  redBorder: pair('rgba(255,59,48,0.40)', 'rgba(255,69,58,0.50)'),
  /** systemBlue at 8% (16% in dark) — tip cards. */
  blueBg: pair('rgba(0,122,255,0.08)', 'rgba(10,132,255,0.16)'),
  /** Action sheet cards: near-opaque white, or the dark elevated gray. */
  sheetBg: pair('rgba(255,255,255,0.96)', 'rgba(44,44,46,0.96)'),
  /** Sign in with Apple: black in light mode, white in dark (Apple HIG). */
  appleButton: pair('#000000', '#FFFFFF'),
  appleButtonLabel: pair('#FFFFFF', '#000000'),

  cat: {
    groceries: system('systemGreen'),
    household: system('systemBlue'),
    personalCare: system('systemPink'),
    beverages: system('systemIndigo'),
    snacks: system('systemOrange'),
    babyKids: system('systemYellow'),
    pet: system('systemTeal'),
    other: system('systemGray'),
  },
};

/**
 * The React Navigation theme for an appearance. Native stack headers take
 * their bar, title, and button colors from it; with none they stay light in
 * dark mode. It takes only strings, so it gives the hex of systemGroupedBackground.
 */
export function navigationTheme(scheme: 'light' | 'dark'): Theme {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: TINT_HEX[scheme],
      background: scheme === 'dark' ? '#000000' : '#F2F2F7',
    },
  };
}

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

/**
 * Each style carries the label color: React Native's Text defaults to black,
 * which would stay black in dark mode. A screen's own color still overrides it.
 */
const text = (style: TextStyle): TextStyle => ({ color: colors.iosLabel, ...style });

const money: TextStyle = text({
  fontFamily: Platform.select({ ios: 'SF Pro Rounded', default: 'System' }),
  fontVariant: ['tabular-nums'],
  fontWeight: '700',
});

export const type = {
  largeTitle: text({ fontSize: 34, fontWeight: '700', letterSpacing: 0.36 }),
  title1: text({ fontSize: 28, fontWeight: '700' }),
  title2: text({ fontSize: 22, fontWeight: '700' }),
  title3: text({ fontSize: 20, fontWeight: '600' }),
  headline: text({ fontSize: 17, fontWeight: '600' }),
  body: text({ fontSize: 17, fontWeight: '400' }),
  callout: text({ fontSize: 16, fontWeight: '400' }),
  subheadline: text({ fontSize: 15, fontWeight: '400' }),
  footnote: text({ fontSize: 13, fontWeight: '400' }),
  caption1: text({ fontSize: 12, fontWeight: '400' }),
  caption2: text({ fontSize: 11, fontWeight: '400' }),
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

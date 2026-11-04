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
  /** Glyphs on a Settings-style colored icon square: white in both modes (HIG). */
  onIconSquare: pair('#FFFFFF', '#FFFFFF'),
  /** systemRed at 40% — the border of a field with an error. */
  redBorder: pair('rgba(255,59,48,0.40)', 'rgba(255,69,58,0.50)'),
  /** systemBlue at 8% (16% in dark) — tip cards. */
  blueBg: pair('rgba(0,122,255,0.08)', 'rgba(10,132,255,0.16)'),
  /** Action sheet cards: near-opaque white, or the dark elevated gray. */
  sheetBg: pair('rgba(255,255,255,0.96)', 'rgba(44,44,46,0.96)'),
  /** The dimmed backdrop behind a bottom sheet. */
  scrim: pair('rgba(0,0,0,0.4)', 'rgba(0,0,0,0.4)'),
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
 * Category colours by name (BC-05 AC 5, DA-9). The server stores these names,
 * never a colour value: `backend/app/models/category_looks.py`. The custom
 * palette (CUSTOM_CATEGORY_COLORS in constants/categories.ts) is every key but
 * `gray`, which only the built-in "Other" uses.
 */
export const categoryPalette = {
  indigo: system('systemIndigo'),
  purple: system('systemPurple'),
  pink: system('systemPink'),
  red: system('systemRed'),
  orange: system('systemOrange'),
  yellow: system('systemYellow'),
  green: system('systemGreen'),
  mint: system('systemMint'),
  teal: system('systemTeal'),
  cyan: system('systemCyan'),
  blue: system('systemBlue'),
  brown: system('systemBrown'),
  gray: system('systemGray'),
} as const satisfies Record<string, ColorValue>;

export type CategoryColorName = keyof typeof categoryPalette;

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
  /** Room under a scroll view's last card, so it clears the home indicator. */
  screenBottom: 80,
} as const;

/**
 * Each style carries the label color: React Native's Text defaults to black,
 * which would stay black in dark mode. A screen's own color still overrides it.
 */
const text = (style: TextStyle): TextStyle => ({ color: colors.iosLabel, ...style });

// 'ui-rounded' is React Native's name for the iOS system rounded design (SF Pro
// Rounded). iOS does not resolve 'SF Pro Rounded' as a family name, so that
// spelling fell back to plain SF.
const money: TextStyle = text({
  fontFamily: Platform.select({ ios: 'ui-rounded', default: 'System' }),
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
  // The design's ring spring (response 0.6 s, damping ratio 0.7, the Activity
  // ring) at mass 1: stiffness (2π/0.6)² ≈ 110, damping 2·0.7·√110 ≈ 14.7.
  ring: { damping: 14.7, stiffness: 110 },
  ui: { damping: 22, stiffness: 220 },
  interactive: { damping: 26, stiffness: 300 },
} as const;

export const touchTarget = {
  minHeight: 44,
  minWidth: 44,
} as const;

/**
 * Dynamic Type thresholds, as React Native's iOS font scale (1 at the default
 * size, about 1.7 at AX1 and 3.6 at AX5). `accessibility` is where rows stack
 * instead of sitting side by side. The caps stop text that must fit a fixed
 * space from growing further; VoiceOver still reads it in full.
 */
export const fontScale = {
  accessibility: 1.7,
  // Native header bar buttons stop growing about here, as UIKit's do.
  headerButtonMax: 1.3,
  // One letter under each of 12 bars on an iPhone SE (about 22pt a column).
  compactChartLabelMax: 1.5,
} as const;

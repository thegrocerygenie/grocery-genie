import type { ImageSourcePropType } from 'react-native';

/**
 * Leaf Drop logo, exported from Claude Design (Logo Lab v2, Direction A) into
 * assets/brand/. The home-screen icon in app.json (ios.icon) uses the same files,
 * so the in-app icon matches the one the user tapped.
 */
export const APP_ICON: Record<'light' | 'dark', ImageSourcePropType> = {
  light: require('../../assets/brand/app-icon-light.png'),
  dark: require('../../assets/brand/app-icon-dark.png'),
};

/** The grocerygenie wordmark (Bricolage Grotesque), dark text for light mode and cream for dark. */
export const WORDMARK: Record<'light' | 'dark', ImageSourcePropType> = {
  light: require('../../assets/brand/wordmark-light.png'),
  dark: require('../../assets/brand/wordmark-dark.png'),
};

/** Width over height of the wordmark exports (1883 × 295 px). */
export const WORDMARK_ASPECT = 1883 / 295;

/** Logo ink #1B1A15: the dark icon tile, and the shadow under the icon (design AppIcon2). */
export const BRAND_INK = '#1B1A15';

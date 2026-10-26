import { InstrumentSerif_400Regular } from '@expo-google-fonts/instrument-serif/400Regular';

/**
 * Design token --font-wordmark: Instrument Serif, for the launch wordmark and
 * the auth headings only, never UI text. The key is the family name styles use.
 */
export const WORDMARK_FONT = 'InstrumentSerif_400Regular';

/** Fonts the root layout loads before the first screen renders. */
export const APP_FONTS = {
  [WORDMARK_FONT]: InstrumentSerif_400Regular,
};

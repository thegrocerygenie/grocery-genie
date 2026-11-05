import type { ColorValue } from 'react-native';

import { colors } from '@/constants/theme';

/** The squares' colours, the design's system colours (PI-01 AC 9). */
export const STORE_COLORS: readonly ColorValue[] = [
  colors.green,
  colors.orange,
  colors.blue,
  colors.indigo,
  colors.pink,
  colors.teal,
  colors.red,
  colors.yellow,
];

/**
 * PI-01 AC 9: a store's square colour, from its id alone, so a store keeps
 * its colour on item detail and Compare stores and across visits. The id is
 * the store's group (merged stores share it). No store: grey.
 */
export function storeColor(storeId: string | null): ColorValue {
  if (!storeId) return colors.gray;
  // FNV-1a: a cheap hash that spreads similar ids apart.
  let hash = 0x811c9dc5;
  for (let i = 0; i < storeId.length; i += 1) {
    hash ^= storeId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return STORE_COLORS[(hash >>> 0) % STORE_COLORS.length];
}

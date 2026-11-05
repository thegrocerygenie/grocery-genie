import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { colors } from '@/constants/theme';

import { storeColor } from '../utils/storeColor';

const SIZE = 28;

/**
 * PI-01 AC 9: the coloured square a store row leads with, as in the design's
 * "By Store" rows. Decorative: the row's own label names the store.
 */
export function StoreSquare({ storeId }: { storeId: string | null }) {
  return (
    <View
      testID={`store-square-${storeId ?? 'none'}`}
      style={[styles.square, { backgroundColor: storeColor(storeId) }]}
    >
      <SymbolView name="cart.fill" size={14} tintColor={colors.onIconSquare} />
    </View>
  );
}

const styles = StyleSheet.create({
  square: {
    width: SIZE,
    height: SIZE,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

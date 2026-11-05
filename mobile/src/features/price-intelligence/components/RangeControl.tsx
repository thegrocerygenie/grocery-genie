import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { colors, spacing, touchTarget, type } from '@/constants/theme';

import { PRICES_COPY } from '../constants';
import { PRICE_RANGES, type PriceRange } from '../utils/priceTrend';

interface RangeControlProps {
  value: PriceRange;
  onChange: (range: PriceRange) => void;
}

/**
 * PI-01 AC 5: the design's segmented 1M · 3M · 6M · 1Y · All under the chart.
 * Each option is a button with a spoken label and a selected state; at large
 * text sizes the options wrap onto more lines (AC 10).
 */
export function RangeControl({ value, onChange }: RangeControlProps) {
  return (
    <View
      style={styles.track}
      testID="range-control"
      accessibilityRole="tablist"
      accessibilityLabel={PRICES_COPY.rangeControlLabel}
    >
      {PRICE_RANGES.map((range) => {
        const selected = range === value;
        return (
          <Pressable
            key={range}
            onPress={() => {
              if (selected) return;
              void Haptics.selectionAsync();
              onChange(range);
            }}
            style={[styles.option, selected && styles.selected]}
            accessibilityRole="button"
            accessibilityLabel={PRICES_COPY.rangeLabels[range]}
            accessibilityState={{ selected }}
          >
            <Text style={[styles.text, selected && styles.textSelected]}>{range}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignSelf: 'center',
    backgroundColor: colors.iosFill3,
    borderRadius: 9,
    padding: 2,
  },
  option: {
    minWidth: touchTarget.minHeight,
    minHeight: touchTarget.minHeight,
    paddingHorizontal: spacing.md,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: { backgroundColor: colors.iosBg2 },
  text: { ...type.footnote, color: colors.iosLabel, fontVariant: ['tabular-nums'] },
  textSelected: { fontWeight: '600' },
});

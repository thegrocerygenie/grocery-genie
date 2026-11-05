import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { colors, radii, spacing, touchTarget, type } from '@/constants/theme';
import { PRICES_COPY } from '../constants';
import type { ItemSuggestion } from '../types';

interface SuggestionCardProps {
  suggestion: ItemSuggestion;
  /** From item detail: the prompt asks only about this item's suggestions. */
  itemId?: string;
}

/**
 * PI-02 AC 2, 7: a medium-confidence match waiting for the user. "Review"
 * opens the full-screen "Same item?" prompt on it (AC 5, 6), where the user
 * merges, keeps the two apart, or skips.
 */
export function SuggestionCard({ suggestion, itemId }: SuggestionCardProps) {
  const router = useRouter();
  const item = suggestion.item.canonical_name;
  const other = suggestion.suggested_item.canonical_name;

  const onReview = () =>
    router.push({
      pathname: '/items/match',
      params: itemId ? { itemId, start: suggestion.id } : { start: suggestion.id },
    });

  return (
    <View style={styles.card}>
      <Text style={styles.question}>{PRICES_COPY.sameQuestion(item, other)}</Text>
      <Text style={styles.caption}>{PRICES_COPY.matchPercent(suggestion.confidence)}</Text>
      <Pressable
        onPress={onReview}
        style={({ pressed }) => [styles.button, styles.primary, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={PRICES_COPY.reviewMatchLabel(item, other)}
      >
        <Text style={styles.primaryLabel}>{PRICES_COPY.reviewMatch}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.iosBg2,
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  question: { ...type.headline },
  caption: { ...type.footnote, color: colors.iosLabel2 },
  button: {
    minHeight: touchTarget.minHeight,
    borderRadius: radii.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
  },
  primary: { backgroundColor: colors.tint },
  primaryLabel: { ...type.headline, color: colors.onTint },
  pressed: { opacity: 0.7 },
});

import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { colors, radii, spacing, touchTarget, type } from '@/constants/theme';
import { PRICES_COPY } from '../constants';
import { useAcceptSuggestion, useRejectSuggestion } from '../hooks/useItems';
import type { ItemSuggestion } from '../types';

interface SuggestionCardProps {
  suggestion: ItemSuggestion;
  /** After "Same Item": the id of the item the two became. */
  onAccepted?: (itemId: string) => void;
}

/**
 * PI-02 AC 2: a medium-confidence match the user confirms or rejects.
 * "Same Item" joins the two price histories; "Different" keeps them apart.
 */
export function SuggestionCard({ suggestion, onAccepted }: SuggestionCardProps) {
  const accept = useAcceptSuggestion();
  const reject = useRejectSuggestion();
  const busy = accept.isPending || reject.isPending;
  const item = suggestion.item.canonical_name;
  const other = suggestion.suggested_item.canonical_name;
  const failed = () => Alert.alert(PRICES_COPY.actionFailed);

  const onSame = () =>
    accept.mutate(suggestion.id, {
      onSuccess: (merged) => {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onAccepted?.(merged.id);
      },
      onError: failed,
    });
  const onDifferent = () => reject.mutate(suggestion.id, { onError: failed });

  return (
    <View style={styles.card}>
      <Text style={styles.question}>{PRICES_COPY.sameQuestion(item, other)}</Text>
      <View style={styles.actions}>
        <Pressable
          onPress={onDifferent}
          disabled={busy}
          style={({ pressed }) => [styles.button, styles.secondary, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={PRICES_COPY.sameNoLabel(item, other)}
          accessibilityState={{ disabled: busy }}
        >
          <Text style={styles.secondaryLabel}>{PRICES_COPY.sameNo}</Text>
        </Pressable>
        <Pressable
          onPress={onSame}
          disabled={busy}
          style={({ pressed }) => [styles.button, styles.primary, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={PRICES_COPY.sameYesLabel(item, other)}
          accessibilityState={{ disabled: busy }}
        >
          <Text style={styles.primaryLabel}>{PRICES_COPY.sameYes}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.iosBg2,
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.md,
  },
  question: { ...type.headline },
  actions: { flexDirection: 'row', gap: spacing.md },
  button: {
    flex: 1,
    minHeight: touchTarget.minHeight,
    borderRadius: radii.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  primary: { backgroundColor: colors.tint },
  secondary: { backgroundColor: colors.iosFill3 },
  primaryLabel: { ...type.headline, color: colors.onTint },
  secondaryLabel: { ...type.headline, color: colors.tint },
  pressed: { opacity: 0.7 },
});

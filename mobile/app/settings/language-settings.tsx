import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { colors, radii, spacing, type } from '@/constants/theme';
import { RECEIPT_LANGUAGES } from '@/constants/receiptLanguages';

// RC-05: extraction reads every language below on every receipt, so there is
// nothing to choose. The screen says what is supported (M6).
export default function LanguageSettingsScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Receipt Languages', headerBackTitle: 'Settings' }} />
      <ScrollView
        style={styles.root}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 60 }}
      >
        <Text style={styles.intro}>
          Receipts in any of these languages are read automatically. There is nothing to set up.
        </Text>

        <View style={styles.listCard}>
          {RECEIPT_LANGUAGES.map((l, i) => (
            <View
              key={l.id}
              style={[styles.row, i > 0 && styles.rowDivider]}
              accessible
              accessibilityLabel={`${l.english}, supported`}
            >
              <View style={{ flex: 1 }}>
                <Text style={[type.subheadline, { fontWeight: '500' }]}>{l.english}</Text>
                {l.native !== l.english ? (
                  <Text style={[type.caption1, { color: colors.iosLabel2 }]}>{l.native}</Text>
                ) : null}
              </View>
              <SymbolView name="checkmark" size={16} tintColor={colors.tint} />
            </View>
          ))}
        </View>

        <Text style={styles.footer}>
          Decimal separators (commas vs. periods) are detected from the receipt itself.
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg },
  intro: {
    ...type.footnote,
    color: colors.iosLabel2,
    paddingHorizontal: 4,
  },
  listCard: {
    backgroundColor: colors.iosBg2,
    borderRadius: radii.list,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    minHeight: 52,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.iosSeparator,
  },
  footer: {
    ...type.footnote,
    color: colors.iosLabel2,
    paddingHorizontal: 4,
  },
});

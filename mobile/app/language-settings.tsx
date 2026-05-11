import React from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Stack } from 'expo-router';

import { colors, radii, spacing, type } from '@/constants/theme';
import { useMe, useUpdatePreferences } from '@/features/auth/hooks/useAuth';

interface Lang {
  id: string;
  english: string;
  native: string;
}

const LANGUAGES: readonly Lang[] = [
  { id: 'en', english: 'English', native: 'auto' },
  { id: 'fr', english: 'French', native: 'Français' },
  { id: 'es', english: 'Spanish', native: 'Español' },
  { id: 'de', english: 'German', native: 'Deutsch' },
  { id: 'sr', english: 'Serbian', native: 'Српски' },
  { id: 'zh', english: 'Mandarin', native: '中文' },
];

export default function LanguageSettingsScreen() {
  const { data: profile } = useMe();
  const update = useUpdatePreferences();
  const enabledList = profile?.preferences.ocr_languages ?? ['en'];
  const enabled: Record<string, boolean> = LANGUAGES.reduce(
    (acc, l) => ({ ...acc, [l.id]: enabledList.includes(l.id) }),
    { en: true } as Record<string, boolean>,
  );

  const toggle = (id: string) => {
    const next = enabled[id]
      ? enabledList.filter((x) => x !== id)
      : [...new Set([...enabledList, id])];
    update.mutate({ ocr_languages: next });
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Language', headerBackTitle: 'Settings' }} />
      <ScrollView
        style={styles.root}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 60 }}
      >
        <Text style={styles.intro}>
          Receipts in any selected language are processed automatically.
        </Text>

        <View style={styles.listCard}>
          {LANGUAGES.map((l, i) => (
            <View
              key={l.id}
              style={[styles.row, i > 0 && styles.rowDivider]}
              accessibilityLabel={`${l.english} ${enabled[l.id] ? 'enabled' : 'disabled'}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={[type.subheadline, { fontWeight: '500' }]}>{l.english}</Text>
                <Text style={[type.caption1, { color: colors.iosLabel2 as string }]}>
                  {l.native}
                </Text>
              </View>
              <Switch
                value={!!enabled[l.id]}
                onValueChange={() => toggle(l.id)}
                trackColor={{ false: colors.iosFill1, true: colors.tint }}
                ios_backgroundColor={colors.iosFill1}
                accessibilityLabel={l.english}
              />
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
    color: colors.iosLabel2 as string,
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
    color: colors.iosLabel2 as string,
    paddingHorizontal: 4,
  },
});

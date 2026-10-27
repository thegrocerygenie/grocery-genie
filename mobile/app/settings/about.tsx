import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { colors, radii, spacing, type } from '@/constants/theme';

/** Settings → About: what the app is and which version is installed. */
export default function AboutScreen() {
  const version = Constants.expoConfig?.version;
  const build = Constants.expoConfig?.ios?.buildNumber;

  return (
    <>
      <Stack.Screen options={{ title: 'About', headerBackTitle: 'Settings' }} />
      <ScrollView
        style={styles.root}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        <View style={styles.appIcon} accessibilityElementsHidden importantForAccessibility="no">
          <SymbolView name="cart.fill" size={36} tintColor="#fff" />
        </View>
        <Text style={styles.name} accessibilityRole="header">
          Grocery Genie
        </Text>
        <Text style={styles.tagline}>Snap a receipt, watch your grocery budget take shape.</Text>

        <View style={styles.listCard}>
          <View style={styles.row}>
            <Text style={type.body}>Version</Text>
            <Text style={styles.value}>{version ?? 'Unknown'}</Text>
          </View>
          {build ? (
            <View style={[styles.row, styles.rowDivider]}>
              <Text style={type.body}>Build</Text>
              <Text style={styles.value}>{build}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg },
  content: { padding: spacing.lg, alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xl },
  appIcon: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  name: { ...type.title2 },
  tagline: {
    ...type.subheadline,
    color: colors.iosLabel2,
    textAlign: 'center',
    maxWidth: 280,
    marginBottom: spacing.lg,
  },
  listCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.iosBg2,
    borderRadius: radii.list,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
    minHeight: 44,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.iosSeparator,
  },
  value: { ...type.body, color: colors.iosLabel2 },
});

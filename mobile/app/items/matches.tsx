import React from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';

import { LoadErrorState } from '@/components/LoadErrorState';
import { colors, spacing, type } from '@/constants/theme';
import { SuggestionCard } from '@/features/price-intelligence/components/SuggestionCard';
import { PRICES_COPY } from '@/features/price-intelligence/constants';
import { useSuggestions } from '@/features/price-intelligence/hooks/useItems';

/** PI-02 AC 2: every possible match waiting for the user, one card each. */
export default function MatchesScreen() {
  const { data, isLoading, isError, refetch } = useSuggestions();

  return (
    <>
      <Stack.Screen
        options={{ title: PRICES_COPY.matchesTitle, headerBackTitle: PRICES_COPY.detailBack }}
      />
      {isError && !data ? (
        <View style={[styles.root, styles.center]}>
          <LoadErrorState title={PRICES_COPY.loadFailed} onRetry={() => refetch()} />
        </View>
      ) : (
        <FlatList
          style={styles.root}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.content}
          data={data ?? []}
          keyExtractor={(s) => s.id}
          ListHeaderComponent={<Text style={styles.intro}>{PRICES_COPY.matchesIntro}</Text>}
          ItemSeparatorComponent={Separator}
          ListEmptyComponent={
            isLoading ? (
              <ActivityIndicator color={colors.tint} />
            ) : (
              <Text style={styles.empty}>{PRICES_COPY.matchesEmpty}</Text>
            )
          }
          renderItem={({ item }) => <SuggestionCard suggestion={item} />}
        />
      )}
    </>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg },
  center: { alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  content: { padding: spacing.lg, paddingBottom: 80 },
  intro: {
    ...type.footnote,
    color: colors.iosLabel2,
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.md,
  },
  separator: { height: spacing.md },
  empty: { ...type.subheadline, color: colors.iosLabel2, textAlign: 'center', marginTop: 80 },
});

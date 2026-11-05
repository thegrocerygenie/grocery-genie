import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';

import { colors, spacing } from '@/constants/theme';
import { useMe } from '@/features/auth/hooks/useAuth';
import { PriceAlertControls } from '@/features/price-intelligence/components/PriceAlertControls';
import { MUTE_COPY } from '@/features/price-intelligence/constants';
import { useItem, usePriceHistory } from '@/features/price-intelligence/hooks/useItems';
import { storesOf } from '@/features/price-intelligence/utils/storesOf';

/**
 * PI-03 AC 10, 13 (DA-7): the item's Alerts screen, pushed from item detail's
 * "Alerts" row, its Back button naming the item (design "PI-03 · Mute
 * alerts"). The item's switch and one per store it was bought at, newest
 * first; every switch reads on = alerts on. Muting is Premium (PREM-02).
 */
export default function ItemAlertsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const item = useItem(id);
  const history = usePriceHistory(id);
  const me = useMe().data;
  const name = item.data?.canonical_name ?? history.data?.item.canonical_name;

  return (
    <>
      <Stack.Screen options={{ title: MUTE_COPY.title, headerBackTitle: name }} />
      {item.data && history.data ? (
        <ScrollView
          style={styles.root}
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
        >
          <PriceAlertControls
            // Unknown while the profile loads: the server decides (403).
            canMute={me === undefined || me.is_premium === true}
            itemId={id}
            itemName={item.data.canonical_name}
            alertsMuted={item.data.alerts_muted}
            mutedUntil={item.data.muted_until}
            stores={storesOf([...history.data.observations].reverse())}
          />
        </ScrollView>
      ) : (
        <View style={[styles.root, styles.loading]}>
          <ActivityIndicator accessibilityLabel={MUTE_COPY.title} />
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  loading: { alignItems: 'center', justifyContent: 'center' },
});

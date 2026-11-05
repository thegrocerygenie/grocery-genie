import React, { useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { colors, radii, spacing, touchTarget, type } from '@/constants/theme';
import { isPremiumRequired } from '@/utils/premium';

import { PRICES_COPY } from '../constants';
import { useMuteItem, useMuteStore, usePriceAlertSettings } from '../hooks/useItems';
import type { StoreRef } from '../types';

interface Props {
  /**
   * Whether the user may mute (Premium, D8, PREM-02 AC 2). False: turning a
   * switch off shows the upgrade prompt instead and the switch stays on;
   * turning a muted switch back on (unmuting) always works.
   */
  canMute: boolean;
  itemId: string;
  itemName: string;
  alertsMuted: boolean;
  /** The stores the item was bought at, newest first. */
  stores: StoreRef[];
}

const ITEM_KEY = 'item';

/**
 * PI-03 AC 4: turn price change alerts off for this item, or for prices paid
 * at one of its stores. A switch shows the new state while it saves and goes
 * back if the save fails. Muting is Premium (PREM-02 AC 5, 6): a free user,
 * or a `403 premium_required`, gets the upgrade prompt.
 */
export function PriceAlertControls({ canMute, itemId, itemName, alertsMuted, stores }: Props) {
  const router = useRouter();
  const settings = usePriceAlertSettings();
  const muteItem = useMuteItem();
  const muteStore = useMuteStore();
  // Switch states being saved, keyed by store id or ITEM_KEY: true is "alerts on".
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const settle = (key: string) =>
    setSaving((s) => {
      const next = { ...s };
      delete next[key];
      return next;
    });
  const upgrade = () =>
    Alert.alert(PRICES_COPY.muteUpgradeTitle, PRICES_COPY.muteUpgradeMessage, [
      { text: PRICES_COPY.notNow, style: 'cancel' },
      { text: PRICES_COPY.upgradeAction, onPress: () => router.push('/paywall') },
    ]);
  const failed = (error: unknown) =>
    isPremiumRequired(error) ? upgrade() : Alert.alert(PRICES_COPY.actionFailed);

  const setItemAlerts = (on: boolean) => {
    if (!on && !canMute) return upgrade();
    setSaving((s) => ({ ...s, [ITEM_KEY]: on }));
    muteItem.mutate(
      { id: itemId, muted: !on },
      { onError: failed, onSettled: () => settle(ITEM_KEY) },
    );
  };
  const setStoreAlerts = (storeId: string, on: boolean) => {
    if (!on && !canMute) return upgrade();
    setSaving((s) => ({ ...s, [storeId]: on }));
    muteStore.mutate(
      { storeId, muted: !on },
      { onError: failed, onSettled: () => settle(storeId) },
    );
  };

  const mutedStores = new Set((settings.data?.muted_stores ?? []).map((s) => s.id));
  const itemOn = saving[ITEM_KEY] ?? !alertsMuted;
  const footer = settings.data
    ? settings.data.enabled
      ? PRICES_COPY.alertsFooter(settings.data.threshold_percent, settings.data.cooldown_days)
      : PRICES_COPY.alertsOff
    : null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel} accessibilityRole="header">
        {PRICES_COPY.alertsHeader}
      </Text>
      <View style={styles.listCard}>
        <ToggleRow
          label={PRICES_COPY.alertsItem}
          accessibilityLabel={PRICES_COPY.alertsItemLabel(itemName)}
          on={itemOn}
          onChange={setItemAlerts}
        />
        {/* Store mutes are known only once the settings load. */}
        {settings.data
          ? stores.map((store) => (
              <ToggleRow
                key={store.id}
                divider
                label={PRICES_COPY.alertsStore(store.name)}
                accessibilityLabel={PRICES_COPY.alertsStoreLabel(store.name)}
                on={saving[store.id] ?? !mutedStores.has(store.id)}
                onChange={(on) => setStoreAlerts(store.id, on)}
              />
            ))
          : null}
      </View>
      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </View>
  );
}

interface ToggleRowProps {
  label: string;
  accessibilityLabel: string;
  on: boolean;
  onChange: (on: boolean) => void;
  divider?: boolean;
}

function ToggleRow({ label, accessibilityLabel, on, onChange, divider }: ToggleRowProps) {
  return (
    <View style={[styles.row, divider && styles.rowDivider]}>
      <Text style={[type.body, styles.rowText]} numberOfLines={2}>
        {label}
      </Text>
      <Switch
        value={on}
        onValueChange={onChange}
        trackColor={{ false: colors.iosFill1, true: colors.green }}
        ios_backgroundColor={colors.iosFill1}
        accessibilityLabel={accessibilityLabel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  sectionLabel: {
    ...type.footnote,
    color: colors.iosLabel2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.xs,
    marginTop: spacing.sm,
  },
  listCard: {
    backgroundColor: colors.iosBg2,
    borderRadius: radii.list,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: touchTarget.minHeight,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.iosSeparator,
  },
  rowText: { flex: 1 },
  footer: { ...type.footnote, color: colors.iosLabel2, paddingHorizontal: spacing.xs },
});

import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { AppSwitch } from '@/components/AppSwitch';
import { OptionSheet } from '@/components/OptionSheet';
import { colors, radii, spacing, touchTarget, type } from '@/constants/theme';
import { isPremiumRequired } from '@/utils/premium';

import { MUTE_COPY, PRICES_COPY } from '../constants';
import { useMuteItem, useMuteStore, usePriceAlertSettings } from '../hooks/useItems';
import type { StoreRef } from '../types';
import { formatMuteEnd, MUTE_FOREVER, muteUntil, type MuteChoice } from '../utils/muteUntil';

interface Props {
  /**
   * Whether the user may mute (Premium, D8, PREM-02 AC 2). False: turning a
   * switch off, or changing "Mute until", shows the upgrade prompt instead;
   * turning a muted switch back on (unmuting) always works.
   */
  canMute: boolean;
  itemId: string;
  itemName: string;
  alertsMuted: boolean;
  /** When the item's mute ends (ISO); null or left out is forever. */
  mutedUntil?: string | null;
  /** The stores the item was bought at, newest first. */
  stores: StoreRef[];
}

const ITEM_KEY = 'item';

/** What the "Mute until" sheet is choosing for: the item, or a store being turned off. */
type SheetTarget = { kind: 'item' } | { kind: 'store'; storeId: string };

/**
 * PI-03 AC 4, 10, 13 (DA-7): the item's Alerts screen, as in the design.
 * Every switch means alerts on (the iOS convention): the item's "Price
 * alerts" switch, with "Mute until" under it while muted, and a switch per
 * store, which asks "Mute until" when turned off. A switch shows the new
 * state while it saves and goes back if the save fails. Muting is Premium
 * (PREM-02 AC 5, 6): a free user, or a `403 premium_required`, gets the
 * upgrade prompt; unmuting is open to everyone.
 */
export function PriceAlertControls({
  canMute,
  itemId,
  itemName,
  alertsMuted,
  mutedUntil,
  stores,
}: Props) {
  const router = useRouter();
  const settings = usePriceAlertSettings();
  const muteItem = useMuteItem();
  const muteStore = useMuteStore();
  // Switch states being saved, keyed by store id or ITEM_KEY: true is "alerts on".
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [sheet, setSheet] = useState<SheetTarget | null>(null);

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

  const saveItem = (on: boolean, until: string | null = null) => {
    setSaving((s) => ({ ...s, [ITEM_KEY]: on }));
    muteItem.mutate(
      { id: itemId, muted: !on, until },
      { onError: failed, onSettled: () => settle(ITEM_KEY) },
    );
  };
  const saveStore = (storeId: string, on: boolean, until: string | null = null) => {
    setSaving((s) => ({ ...s, [storeId]: on }));
    muteStore.mutate(
      { storeId, muted: !on, until },
      { onError: failed, onSettled: () => settle(storeId) },
    );
  };

  // Off mutes the item forever at once; "Mute until" then sets a time.
  const setItemAlerts = (on: boolean) => {
    if (!on && !canMute) return upgrade();
    saveItem(on);
  };
  // Off asks "Mute until" first; closing the sheet leaves the store on.
  const setStoreAlerts = (storeId: string, on: boolean) => {
    if (on) return saveStore(storeId, true);
    if (!canMute) return upgrade();
    setSheet({ kind: 'store', storeId });
  };
  const openItemUntil = () => (canMute ? setSheet({ kind: 'item' }) : upgrade());
  const choose = (choice: MuteChoice) => {
    const target = sheet;
    setSheet(null);
    if (!target) return;
    const until = muteUntil(choice);
    if (target.kind === 'item') saveItem(false, until);
    else saveStore(target.storeId, false, until);
  };

  const mutedStores = new Map(
    (settings.data?.muted_stores ?? []).map((s) => [s.id, s.muted_until] as const),
  );
  const itemOn = saving[ITEM_KEY] ?? !alertsMuted;
  const itemUntil = mutedUntil ? formatMuteEnd(mutedUntil) : MUTE_COPY.forever;

  return (
    <View style={styles.root}>
      <View style={styles.group}>
        <Text style={styles.sectionLabel} accessibilityRole="header">
          {MUTE_COPY.itemHeader}
        </Text>
        <View style={styles.listCard}>
          <ToggleRow
            label={MUTE_COPY.itemSwitch}
            subtitle={MUTE_COPY.itemSubtitle(itemName)}
            strong
            accessibilityLabel={MUTE_COPY.itemSwitchLabel(itemName)}
            on={itemOn}
            saving={ITEM_KEY in saving}
            onChange={setItemAlerts}
          />
          {itemOn ? null : (
            <Pressable
              onPress={openItemUntil}
              style={({ pressed }) => [styles.row, styles.rowDivider, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={MUTE_COPY.muteUntilLabel(itemUntil)}
            >
              <Text style={[type.body, styles.rowText]}>{MUTE_COPY.muteUntil}</Text>
              <Text style={styles.value}>{itemUntil}</Text>
              <SymbolView name="chevron.right" size={12} tintColor={colors.iosLabel3} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Store mutes are known only once the settings load. */}
      {settings.data && stores.length > 0 ? (
        <View style={styles.group}>
          <Text style={styles.sectionLabel} accessibilityRole="header">
            {MUTE_COPY.storeHeader}
          </Text>
          <View style={styles.listCard}>
            {stores.map((store, i) => {
              const muted = mutedStores.has(store.id);
              const until = mutedStores.get(store.id);
              const on = saving[store.id] ?? !muted;
              return (
                <ToggleRow
                  key={store.id}
                  divider={i > 0}
                  label={store.name}
                  subtitle={!on && until ? MUTE_COPY.until(formatMuteEnd(until)) : undefined}
                  accessibilityLabel={MUTE_COPY.storeSwitchLabel(store.name)}
                  on={on}
                  saving={store.id in saving}
                  onChange={(next) => setStoreAlerts(store.id, next)}
                />
              );
            })}
          </View>
          <Text style={styles.footer}>{MUTE_COPY.storeNote}</Text>
        </View>
      ) : null}

      {settings.data && !settings.data.enabled ? (
        <Text style={styles.footer}>{PRICES_COPY.alertsOff}</Text>
      ) : null}
      <Text style={styles.footer}>{MUTE_COPY.footer}</Text>

      <OptionSheet
        visible={sheet !== null}
        title={MUTE_COPY.muteUntil}
        options={MUTE_COPY.choices.map((label, key) => ({ key, label }))}
        selected={sheet?.kind === 'item' && !mutedUntil ? MUTE_FOREVER : -1}
        onSelect={(key) => choose(key as MuteChoice)}
        onClose={() => setSheet(null)}
      />
    </View>
  );
}

interface ToggleRowProps {
  label: string;
  subtitle?: string;
  /** The item's switch: its label in semibold, as in the design. */
  strong?: boolean;
  accessibilityLabel: string;
  on: boolean;
  /** Its change is saving: the switch is disabled, so a second flip sends nothing (F8). */
  saving: boolean;
  onChange: (on: boolean) => void;
  divider?: boolean;
}

function ToggleRow({
  label,
  subtitle,
  strong,
  accessibilityLabel,
  on,
  saving,
  onChange,
  divider,
}: ToggleRowProps) {
  return (
    <View style={[styles.row, divider && styles.rowDivider]}>
      <View style={styles.rowText}>
        <Text style={[type.body, strong && styles.strong]}>{label}</Text>
        {subtitle ? <Text style={styles.caption}>{subtitle}</Text> : null}
      </View>
      <AppSwitch
        value={on}
        onValueChange={onChange}
        disabled={saving}
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled: saving, busy: saving }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  group: { gap: spacing.sm },
  sectionLabel: {
    ...type.footnote,
    color: colors.iosLabel2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.lg,
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
  rowText: { flex: 1, gap: 2 },
  strong: { fontWeight: '600' },
  caption: { ...type.footnote, color: colors.iosLabel2 },
  value: { ...type.body, color: colors.iosLabel2 },
  pressed: { opacity: 0.6 },
  footer: { ...type.footnote, color: colors.iosLabel2, paddingHorizontal: spacing.lg },
});

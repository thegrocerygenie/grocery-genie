import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { colors, radii, spacing, type } from '@/constants/theme';
import { useMe, useUpdatePreferences } from '@/features/auth/hooks/useAuth';
import { useBudgets } from '@/features/budget/hooks/useBudget';
import { useCategories } from '@/features/budget/hooks/useCategories';
import {
  PRICE_ALERT_SETTINGS_COPY as PRICE_COPY,
  PRICE_ALERT_THRESHOLDS,
} from '@/features/price-intelligence/constants';
import {
  useMuteItem,
  useMuteStore,
  usePriceAlertSettings,
  useUpdatePriceAlertSettings,
} from '@/features/price-intelligence/hooks/useItems';
import type { PriceAlertSettings } from '@/features/price-intelligence/types';
import { useNotificationStore } from '@/store/notificationStore';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The threshold choices: the preset ones plus the default and the user's own. */
function thresholdChoices(settings: PriceAlertSettings): number[] {
  const all = new Set<number>([
    ...PRICE_ALERT_THRESHOLDS,
    settings.default_threshold_percent,
    settings.threshold_percent,
  ]);
  return [...all].sort((a, b) => a - b);
}

export default function NotificationSettingsScreen() {
  const { data: profile } = useMe();
  const update = useUpdatePreferences();
  const localStore = useNotificationStore();
  const [dayPickerOpen, setDayPickerOpen] = useState(false);
  const [thresholdPickerOpen, setThresholdPickerOpen] = useState(false);
  const { data: budgets } = useBudgets();
  const { data: categories } = useCategories();

  // PI-03 settings: price change alerts on or off, their threshold, and mutes.
  const { data: priceAlerts } = usePriceAlertSettings();
  const updatePriceAlerts = useUpdatePriceAlertSettings();
  const unmuteItem = useMuteItem();
  const unmuteStore = useMuteStore();
  const priceAlertsOn = updatePriceAlerts.isPending
    ? (updatePriceAlerts.variables.enabled ?? priceAlerts?.enabled)
    : priceAlerts?.enabled;
  const setThresholdPercent = (percent: number) => {
    if (!priceAlerts) return;
    // The default is sent as null, so a later change of the default applies.
    const isDefault = percent === priceAlerts.default_threshold_percent;
    updatePriceAlerts.mutate({ threshold_percent: isDefault ? null : percent });
  };

  // Server is source of truth; local store stays as offline fallback.
  const prefs = profile?.preferences;
  const fifty = prefs?.notification_thresholds.fifty ?? localStore.preferences.fiftyPercent;
  const eighty = prefs?.notification_thresholds.eighty ?? localStore.preferences.eightyPercent;
  const hundred = prefs?.notification_thresholds.hundred ?? localStore.preferences.hundredPercent;
  const summaryEnabled =
    prefs?.weekly_summary.enabled ?? localStore.preferences.weeklySummaryEnabled;
  const summaryDay = prefs?.weekly_summary.day ?? localStore.preferences.weeklySummaryDay;

  // BC-03 AC 4: only a category with a budget can alert, so only those are listed.
  const muted = prefs?.muted_alert_categories ?? [];
  const budgetedCategories = (categories ?? []).filter((c) =>
    (budgets ?? []).some((b) => b.category_id === c.id),
  );
  const setCategoryAlerts = (categoryId: string, on: boolean) => {
    const next = on
      ? muted.filter((id) => id !== categoryId)
      : [...muted.filter((id) => id !== categoryId), categoryId];
    update.mutate({ muted_alert_categories: next });
  };

  const setThreshold = (key: 'fifty' | 'eighty' | 'hundred', value: boolean) => {
    update.mutate({ notification_thresholds: { [key]: value } });
    if (key === 'fifty') localStore.setThreshold('fiftyPercent', value);
    if (key === 'eighty') localStore.setThreshold('eightyPercent', value);
    if (key === 'hundred') localStore.setThreshold('hundredPercent', value);
  };

  const setWeeklySummaryEnabled = (value: boolean) => {
    update.mutate({ weekly_summary: { enabled: value } });
    localStore.setWeeklySummaryEnabled(value);
  };

  const setWeeklySummaryDay = (day: number) => {
    update.mutate({ weekly_summary: { day } });
    localStore.setWeeklySummaryDay(day);
  };

  return (
    <>
      {/* Design "15 · Notifications": pushed from Settings with Back, not a modal. */}
      <Stack.Screen options={{ title: 'Alerts', headerBackTitle: 'Settings' }} />
      <ScrollView
        style={styles.root}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
      >
        <Section
          header="BUDGET ALERTS"
          footer="We'll send a quiet notification once per threshold per month."
        >
          <ToggleRow label="50% of budget" on={fifty} onChange={(v) => setThreshold('fifty', v)} />
          <ToggleRow
            label="80% of budget"
            on={eighty}
            onChange={(v) => setThreshold('eighty', v)}
          />
          <ToggleRow
            label="100% of budget"
            on={hundred}
            onChange={(v) => setThreshold('hundred', v)}
          />
        </Section>

        {budgetedCategories.length > 0 ? (
          <Section
            header="CATEGORY ALERTS"
            footer="Turn off alerts for one category's budget. Your overall budget still alerts."
          >
            {budgetedCategories.map((c) => (
              <ToggleRow
                key={c.id}
                label={c.name}
                accessibilityLabel={`${c.name} alerts`}
                on={!muted.includes(c.id)}
                onChange={(v) => setCategoryAlerts(c.id, v)}
              />
            ))}
          </Section>
        ) : null}

        {priceAlerts ? (
          <Section header={PRICE_COPY.header} footer={PRICE_COPY.footer(priceAlerts.cooldown_days)}>
            <ToggleRow
              label={PRICE_COPY.enabled}
              on={priceAlertsOn ?? true}
              onChange={(v) => updatePriceAlerts.mutate({ enabled: v })}
            />
            {priceAlertsOn ? (
              <NavRow
                label={PRICE_COPY.threshold}
                value={`${priceAlerts.threshold_percent}%`}
                onPress={() => setThresholdPickerOpen(true)}
              />
            ) : null}
          </Section>
        ) : null}

        {priceAlerts && priceAlerts.muted_items.length + priceAlerts.muted_stores.length > 0 ? (
          <Section header={PRICE_COPY.mutedHeader} footer={PRICE_COPY.mutedFooter}>
            {priceAlerts.muted_items.map((item) => (
              <UnmuteRow
                key={`item-${item.id}`}
                name={item.canonical_name}
                kind={PRICE_COPY.item}
                onPress={() => unmuteItem.mutate({ id: item.id, muted: false })}
              />
            ))}
            {priceAlerts.muted_stores.map((store) => (
              <UnmuteRow
                key={`store-${store.id}`}
                name={store.name}
                kind={PRICE_COPY.store}
                onPress={() => unmuteStore.mutate({ storeId: store.id, muted: false })}
              />
            ))}
          </Section>
        ) : null}

        <Section header="WEEKLY SUMMARY">
          <ToggleRow
            label="Send weekly summary"
            on={summaryEnabled}
            onChange={setWeeklySummaryEnabled}
          />
          {summaryEnabled ? (
            <NavRow
              label="Day"
              value={DAYS[summaryDay] ?? 'Sunday'}
              onPress={() => setDayPickerOpen(true)}
            />
          ) : null}
        </Section>
      </ScrollView>

      <DayPickerSheet
        visible={dayPickerOpen}
        selected={summaryDay}
        onSelect={(d) => {
          setWeeklySummaryDay(d);
          setDayPickerOpen(false);
        }}
        onClose={() => setDayPickerOpen(false)}
      />

      {priceAlerts ? (
        <PickerSheet
          visible={thresholdPickerOpen}
          options={thresholdChoices(priceAlerts).map((p) => ({
            key: p,
            label: PRICE_COPY.thresholdOption(p, p === priceAlerts.default_threshold_percent),
          }))}
          selected={priceAlerts.threshold_percent}
          onSelect={(p) => {
            setThresholdPercent(p);
            setThresholdPickerOpen(false);
          }}
          onClose={() => setThresholdPickerOpen(false)}
        />
      ) : null}
    </>
  );
}

interface SectionProps {
  header?: string;
  footer?: string;
  children: React.ReactNode;
}

function Section({ header, footer, children }: SectionProps) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View>
      {header ? <Text style={styles.sectionLabel}>{header}</Text> : null}
      <View style={styles.listCard}>
        {items.map((c, i) => (
          <React.Fragment key={i}>
            {c}
            {i < items.length - 1 ? <View style={styles.separator} /> : null}
          </React.Fragment>
        ))}
      </View>
      {footer ? <Text style={styles.sectionFooter}>{footer}</Text> : null}
    </View>
  );
}

interface ToggleRowProps {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
  /** Defaults to the label. */
  accessibilityLabel?: string;
}

function ToggleRow({ label, on, onChange, accessibilityLabel }: ToggleRowProps) {
  return (
    <View style={styles.row}>
      <Text style={type.body}>{label}</Text>
      <Switch
        value={on}
        onValueChange={onChange}
        trackColor={{ false: colors.iosFill1, true: colors.green }}
        ios_backgroundColor={colors.iosFill1}
        accessibilityLabel={accessibilityLabel ?? label}
      />
    </View>
  );
}

interface NavRowProps {
  label: string;
  value: string;
  onPress: () => void;
}

function NavRow({ label, value, onPress }: NavRowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text style={type.body}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text style={[type.body, { color: colors.iosLabel2 }]}>{value}</Text>
        <SymbolView name="chevron.right" size={12} tintColor={colors.iosLabel3} />
      </View>
    </Pressable>
  );
}

interface UnmuteRowProps {
  name: string;
  /** "Item" or "Store", shown under the name. */
  kind: string;
  onPress: () => void;
}

function UnmuteRow({ name, kind, onPress }: UnmuteRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={type.body} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.caption}>{kind}</Text>
      </View>
      <Pressable
        onPress={onPress}
        hitSlop={8}
        style={styles.inlineButton}
        accessibilityRole="button"
        accessibilityLabel={PRICE_COPY.unmuteLabel(name)}
      >
        <Text style={styles.link}>{PRICE_COPY.unmute}</Text>
      </Pressable>
    </View>
  );
}

interface DayPickerSheetProps {
  visible: boolean;
  selected: number;
  onSelect: (day: number) => void;
  onClose: () => void;
}

function DayPickerSheet({ visible, selected, onSelect, onClose }: DayPickerSheetProps) {
  return (
    <PickerSheet
      visible={visible}
      options={DAYS.map((d, i) => ({ key: i, label: d }))}
      selected={selected}
      onSelect={onSelect}
      onClose={onClose}
    />
  );
}

interface PickerSheetProps {
  visible: boolean;
  options: { key: number; label: string }[];
  selected: number;
  onSelect: (key: number) => void;
  onClose: () => void;
}

function PickerSheet({ visible, options, selected, onSelect, onClose }: PickerSheetProps) {
  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      {/* Taps only: accessible, these would hide the options from VoiceOver. */}
      <Pressable
        style={sheetStyles.backdrop}
        onPress={onClose}
        accessible={false}
        onAccessibilityEscape={onClose}
      >
        <Pressable
          style={sheetStyles.sheet}
          onPress={(e) => e.stopPropagation()}
          accessible={false}
        >
          <View style={styles.listCard}>
            {options.map((o, i) => (
              <Pressable
                key={o.key}
                onPress={() => onSelect(o.key)}
                style={[styles.row, i > 0 && styles.rowDivider]}
                accessibilityRole="button"
                accessibilityLabel={o.label}
                accessibilityState={{ selected: selected === o.key }}
              >
                <Text style={type.body}>{o.label}</Text>
                {selected === o.key ? (
                  <SymbolView name="checkmark" size={14} tintColor={colors.tint} />
                ) : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    backgroundColor: 'transparent',
  },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg },

  sectionLabel: {
    ...type.footnote,
    color: colors.iosLabel2,
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  sectionFooter: {
    ...type.footnote,
    color: colors.iosLabel2,
    paddingHorizontal: 16,
    paddingTop: 6,
  },

  listCard: {
    backgroundColor: colors.iosBg2,
    borderRadius: radii.list,
    overflow: 'hidden',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.iosSeparator,
  },
  rowText: { flex: 1, gap: 2 },
  caption: { ...type.footnote, color: colors.iosLabel2 },
  inlineButton: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  link: { ...type.body, color: colors.tint },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.iosSeparator,
    marginLeft: 16,
  },
});

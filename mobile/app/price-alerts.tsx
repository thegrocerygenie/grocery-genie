import React, { useMemo, useState } from 'react';
import {
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { LoadErrorState } from '@/components/LoadErrorState';
import { OptionSheet } from '@/components/OptionSheet';
import { colors, fontScale, radii, spacing, type } from '@/constants/theme';
import { Sparkline } from '@/features/price-intelligence/components/Sparkline';
import {
  PRICE_ALERTS_LIST_COPY as COPY,
  PRICE_ALERT_COOLDOWNS,
  PRICE_ALERT_SETTINGS_COPY,
  PRICE_ALERT_THRESHOLDS,
} from '@/features/price-intelligence/constants';
import {
  usePriceAlertSettings,
  useUpdatePriceAlertSettings,
} from '@/features/price-intelligence/hooks/useItems';
import { usePriceAlerts } from '@/features/price-intelligence/hooks/usePriceAlerts';
import type { PriceAlertSettings } from '@/features/price-intelligence/types';
import {
  groupPriceAlerts,
  toPriceAlertRow,
  type PriceAlertRow,
} from '@/features/price-intelligence/utils/priceAlertRows';

/** The preset choices plus the default and the user's own, ascending. */
function choices(preset: readonly number[], ...always: number[]): number[] {
  return [...new Set<number>([...preset, ...always])].sort((a, b) => a - b);
}

/**
 * PI-03 AC 5-7 (DA-4): the user's price change alerts, newest first under
 * "This week" and "Earlier", then the Threshold and Cooldown settings.
 * Opened from the Budget dashboard's bell and from Settings → Alerts.
 */
export default function PriceAlertsScreen() {
  const router = useRouter();
  const alerts = usePriceAlerts();
  const { data: settings } = usePriceAlertSettings();
  const update = useUpdatePriceAlertSettings();
  const [picker, setPicker] = useState<'threshold' | 'cooldown' | null>(null);

  const sections = useMemo(
    () => groupPriceAlerts((alerts.data ?? []).map(toPriceAlertRow), new Date()),
    [alerts.data],
  );

  const header = <Stack.Screen options={{ title: COPY.title, headerLargeTitle: true }} />;

  if (alerts.isError && !alerts.data) {
    return (
      <>
        {header}
        <View style={styles.root}>
          <LoadErrorState title={COPY.loadFailed} onRetry={() => void alerts.refetch()} />
        </View>
      </>
    );
  }

  // The default is sent as null, so a later change of the default applies.
  const save = (field: 'threshold_percent' | 'cooldown_days', value: number, fallback: number) => {
    update.mutate({ [field]: value === fallback ? null : value });
    setPicker(null);
  };

  return (
    <>
      {header}
      <SectionList
        style={styles.root}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        sections={sections}
        keyExtractor={(row) => row.id}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionLabel} accessibilityRole="header">
            {section.title}
          </Text>
        )}
        renderItem={({ item, index, section }) => (
          <AlertRow
            row={item}
            first={index === 0}
            last={index === section.data.length - 1}
            onPress={item.itemId ? () => router.push(`/items/${item.itemId}`) : undefined}
          />
        )}
        SectionSeparatorComponent={SectionGap}
        ListEmptyComponent={
          alerts.isLoading ? null : <EmptyState threshold={settings?.threshold_percent} />
        }
        ListFooterComponent={
          settings ? (
            <SettingsGroup settings={settings} onOpen={setPicker} failed={update.isError} />
          ) : null
        }
      />

      {settings ? (
        <>
          <OptionSheet
            visible={picker === 'threshold'}
            options={choices(
              PRICE_ALERT_THRESHOLDS,
              settings.default_threshold_percent,
              settings.threshold_percent,
            ).map((p) => ({
              key: p,
              label: PRICE_ALERT_SETTINGS_COPY.thresholdOption(
                p,
                p === settings.default_threshold_percent,
              ),
            }))}
            selected={settings.threshold_percent}
            onSelect={(p) => save('threshold_percent', p, settings.default_threshold_percent)}
            onClose={() => setPicker(null)}
          />
          <OptionSheet
            visible={picker === 'cooldown'}
            options={choices(
              PRICE_ALERT_COOLDOWNS,
              settings.default_cooldown_days,
              settings.cooldown_days,
            ).map((d) => ({
              key: d,
              label: COPY.cooldownOption(d, d === settings.default_cooldown_days),
            }))}
            selected={settings.cooldown_days}
            onSelect={(d) => save('cooldown_days', d, settings.default_cooldown_days)}
            onClose={() => setPicker(null)}
          />
        </>
      ) : null}
    </>
  );
}

function SectionGap() {
  return <View style={styles.sectionGap} />;
}

interface AlertRowProps {
  row: PriceAlertRow;
  first: boolean;
  last: boolean;
  onPress?: () => void;
}

function AlertRow({ row, first, last, onPress }: AlertRowProps) {
  const up = row.direction === 'up';
  const label = COPY.rowLabel(
    row.itemName,
    row.direction,
    row.percentText.slice(1),
    row.detail,
    row.stockUp,
  );
  // At accessibility sizes the name and percent do not fit side by side on an
  // SE ("Wh ole…", F3): the percent goes under the whole name, as on Items.
  const stacked = useWindowDimensions().fontScale >= fontScale.accessibility;
  return (
    <View style={[styles.card, first && styles.cardTop, last && styles.cardBottom]}>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        style={({ pressed }) => [styles.alertRow, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <View style={[styles.arrow, up ? styles.arrowUp : styles.arrowDown]}>
          <SymbolView
            name={up ? 'arrow.up.right' : 'arrow.down.right'}
            size={16}
            weight="bold"
            tintColor={colors.onIconSquare}
          />
        </View>
        <View style={styles.alertText}>
          <View
            style={[styles.titleLine, stacked && styles.titleStacked]}
            testID={`price-alert-title-${row.id}`}
          >
            <Text style={styles.itemName} numberOfLines={stacked ? undefined : 2}>
              {row.itemName}
            </Text>
            <Text style={[styles.percent, up ? styles.up : styles.down]}>{row.percentText}</Text>
          </View>
          <Text style={styles.detail}>{row.detail}</Text>
          {row.stockUp ? <Text style={styles.detail}>{COPY.stockUp}</Text> : null}
          <View style={styles.spark}>
            <Sparkline prices={row.sparkline} color={up ? colors.red : colors.green} />
          </View>
        </View>
      </Pressable>
      {last ? null : <View style={styles.separator} />}
    </View>
  );
}

function EmptyState({ threshold }: { threshold: number | undefined }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <SymbolView name="bell" size={26} tintColor={colors.iosLabel2} />
      </View>
      <Text style={[type.headline, styles.centered]} accessibilityRole="header">
        {COPY.emptyTitle}
      </Text>
      {threshold !== undefined ? (
        <Text style={[type.subheadline, styles.emptyBody]}>{COPY.emptyBody(threshold)}</Text>
      ) : null}
    </View>
  );
}

interface SettingsGroupProps {
  settings: PriceAlertSettings;
  onOpen: (picker: 'threshold' | 'cooldown') => void;
  failed: boolean;
}

function SettingsGroup({ settings, onOpen, failed }: SettingsGroupProps) {
  return (
    <View style={styles.settings}>
      <Text style={styles.sectionLabel} accessibilityRole="header">
        {COPY.settingsHeader}
      </Text>
      <View style={[styles.card, styles.cardTop, styles.cardBottom]}>
        <SettingRow
          icon="bell.fill"
          iconStyle={styles.iconOrange}
          label={COPY.threshold}
          value={`${settings.threshold_percent}%`}
          onPress={() => onOpen('threshold')}
        />
        <View style={styles.separatorIcon} />
        <SettingRow
          icon="clock.fill"
          iconStyle={styles.iconBlue}
          label={COPY.cooldown}
          value={COPY.days(settings.cooldown_days)}
          onPress={() => onOpen('cooldown')}
        />
      </View>
      <Text style={styles.footer}>
        {COPY.footer(settings.cooldown_days, settings.threshold_percent)}
      </Text>
      {failed ? (
        <Text style={[styles.footer, styles.error]} accessibilityRole="alert">
          {COPY.saveFailed}
        </Text>
      ) : null}
    </View>
  );
}

interface SettingRowProps {
  icon: 'bell.fill' | 'clock.fill';
  iconStyle: StyleProp<ViewStyle>;
  label: string;
  value: string;
  onPress: () => void;
}

function SettingRow({ icon, iconStyle, label, value, onPress }: SettingRowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.settingRow, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
    >
      <View style={[styles.settingIcon, iconStyle]}>
        <SymbolView name={icon} size={14} tintColor={colors.onIconSquare} />
      </View>
      <Text style={[type.body, styles.settingLabel]}>{label}</Text>
      <Text style={[type.body, styles.settingValue]}>{value}</Text>
      <SymbolView name="chevron.right" size={12} tintColor={colors.iosLabel3} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  sectionGap: { height: spacing.sm },

  sectionLabel: {
    ...type.footnote,
    color: colors.iosLabel2,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  footer: {
    ...type.footnote,
    color: colors.iosLabel2,
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  error: { color: colors.redText },

  card: { backgroundColor: colors.iosBg2, overflow: 'hidden' },
  cardTop: { borderTopLeftRadius: radii.list, borderTopRightRadius: radii.list },
  cardBottom: { borderBottomLeftRadius: radii.list, borderBottomRightRadius: radii.list },
  pressed: { backgroundColor: colors.iosFill1 },

  alertRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 44,
  },
  arrow: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowUp: { backgroundColor: colors.red },
  arrowDown: { backgroundColor: colors.green },
  alertText: { flex: 1, minWidth: 0 },
  titleLine: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  titleStacked: { flexDirection: 'column', gap: 0 },
  itemName: { ...type.subheadline, fontWeight: '600', color: colors.iosLabel, flexShrink: 1 },
  percent: { ...type.subheadline, fontWeight: '600', fontVariant: ['tabular-nums'] },
  up: { color: colors.redText },
  down: { color: colors.greenText },
  detail: { ...type.footnote, color: colors.iosLabel2, marginTop: 2 },
  spark: { marginTop: 6 },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.iosSeparator,
    marginLeft: 62,
  },

  empty: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.iosFill1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  centered: { textAlign: 'center' },
  emptyBody: { color: colors.iosLabel2, textAlign: 'center', paddingHorizontal: spacing.lg },

  settings: { marginTop: spacing.lg },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  settingIcon: {
    width: 29,
    height: 29,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconOrange: { backgroundColor: colors.orange },
  iconBlue: { backgroundColor: colors.blue },
  settingLabel: { flex: 1 },
  settingValue: { color: colors.iosLabel2 },
  separatorIcon: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.iosSeparator,
    marginLeft: 57,
  },
});

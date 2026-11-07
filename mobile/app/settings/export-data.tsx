import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { AppSwitch } from '@/components/AppSwitch';
import { PremiumUpgradePrompt } from '@/components/PremiumUpgradePrompt';
import { colors, fontScale, radii, spacing, touchTarget, type } from '@/constants/theme';
import { useMe } from '@/features/auth/hooks/useAuth';
import { EXPORT_STRINGS as S } from '@/features/settings/content/export';
import { useExportData, useExportSummary } from '@/features/settings/hooks/useExportData';
import {
  isExportBusy,
  type ExportFormat,
  type ExportInclude,
} from '@/features/settings/services/exportApi';
import {
  compareMonths,
  monthOf,
  monthsForPeriod,
  rangeDates,
  rangeIsValid,
  type ExportPeriod,
  type Month,
} from '@/features/settings/utils/exportRange';
import { isPremiumRequired } from '@/utils/premium';

type Includes = Record<ExportInclude, boolean>;

// PREM-04 AC 3: Receipt images start off, everything else on.
const DEFAULT_INCLUDES: Includes = { receipts: true, prices: true, budgets: true, images: false };

function monthLabel(m: Month): string {
  return `${S.monthsShort[m.month - 1]} ${m.year}`;
}

/**
 * Settings → Export data (NFR Privacy 2, V11-P2; options PREM-04, design
 * "PI · Export"). A Range (Last 12 months first), a Format (CSV first), the
 * Includes switches, and "Export N receipts" with the server's count.
 * Premium (D2): a free user sees the upgrade prompt in place of the export,
 * never an error.
 */
export default function ExportDataScreen() {
  const router = useRouter();
  const { data: profile, isLoading } = useMe();
  const exportData = useExportData();

  const [now] = useState(() => new Date());
  const [period, setPeriod] = useState<ExportPeriod>('last12');
  const [custom, setCustom] = useState(() => {
    const months = monthsForPeriod('last12', now);
    return { from: months.from as Month, to: months.to as Month };
  });
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [includes, setIncludes] = useState<Includes>(DEFAULT_INCLUDES);
  const [periodSheet, setPeriodSheet] = useState(false);
  const [monthSheet, setMonthSheet] = useState<'from' | 'to' | null>(null);

  const months = monthsForPeriod(period, now, custom);
  const valid = rangeIsValid(months.from, months.to);
  const { from, to } = rangeDates(months.from, months.to);

  const isPremium = profile?.is_premium === true;
  const summary = useExportSummary(from, to, isPremium && valid);

  const refused = isPremiumRequired(exportData.error) || isPremiumRequired(summary.error);
  const free = profile?.is_premium === false || refused;
  const busy = isExportBusy(exportData.error);
  const failed = exportData.isError && !refused && !busy;
  const pending = exportData.isPending;

  const count = summary.data?.receipt_count;
  const onlyOneOn = Object.values(includes).filter(Boolean).length === 1;

  // "Export N receipts" only while receipts are in the export (AC 4). Without
  // them the label names no count; categories and budgets are never cut by
  // the range, so only an empty range with them off has nothing to export.
  const countsReceipts = includes.receipts;
  const nothing = count === 0 && (countsReceipts || !includes.budgets);
  let label: string;
  if (pending) label = S.preparing;
  else if (!countsReceipts) label = S.actionData;
  else if (!valid) label = S.actionNoCount;
  else if (count === 0) label = S.noReceipts;
  else if (count !== undefined) label = S.action(count);
  else if (summary.isError) label = S.actionNoCount;
  else label = S.counting;
  const disabled = pending || !valid || nothing || (count === undefined && !summary.isError);

  const pickPeriod = (next: ExportPeriod) => {
    if (next === 'custom' && period !== 'custom' && months.from && months.to) {
      // Custom starts from the months on screen.
      setCustom({ from: months.from, to: months.to });
    }
    setPeriod(next);
    setPeriodSheet(false);
  };

  const pickMonth = (which: 'from' | 'to', month: Month) => {
    const base = months.from && months.to ? { from: months.from, to: months.to } : custom;
    setCustom({ ...base, [which]: month });
    setPeriod('custom');
    setMonthSheet(null);
  };

  const toggle = (key: ExportInclude, on: boolean) => {
    setIncludes((current) => ({ ...current, [key]: on }));
  };

  const startExport = () => {
    exportData.mutate({
      format,
      from,
      to,
      includes: S.includeOrder.filter((key) => includes[key]),
    });
  };

  return (
    <>
      <Stack.Screen options={{ title: S.screenTitle, headerBackTitle: S.backTitle }} />
      <ScrollView
        style={styles.root}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.tint} style={styles.loading} />
        ) : free ? (
          <View style={styles.card}>
            <PremiumUpgradePrompt
              title={S.upgradeTitle}
              message={S.upgradeMessage}
              upgradeLabel={S.upgradeAction}
              onUpgrade={() => router.push('/paywall')}
            />
          </View>
        ) : (
          <>
            <View style={styles.intro} accessible accessibilityLabel={S.intro}>
              <View style={styles.introIcon}>
                <SymbolView name="doc.text" size={14} tintColor={colors.onTint} />
              </View>
              <Text style={styles.introText}>{S.intro}</Text>
            </View>

            <Section header={S.rangeHeader}>
              <NavRow
                label={S.period}
                value={S.periods[period]}
                onPress={() => setPeriodSheet(true)}
              />
              <NavRow
                label={S.from}
                value={months.from ? monthLabel(months.from) : S.allTimeFrom}
                onPress={() => setMonthSheet('from')}
              />
              <NavRow
                label={S.to}
                value={months.to ? monthLabel(months.to) : S.allTimeTo}
                onPress={() => setMonthSheet('to')}
              />
            </Section>
            {!valid ? (
              <Text style={styles.error} accessibilityRole="alert">
                {S.rangeInvalid}
              </Text>
            ) : null}

            <Section header={S.formatHeader}>
              {S.formatOrder.map((key) => (
                <RadioRow
                  key={key}
                  title={S.formats[key].title}
                  detail={S.formats[key].detail}
                  selected={format === key}
                  disabled={pending}
                  onPress={() => setFormat(key)}
                />
              ))}
            </Section>

            <Section header={S.includesHeader} footer={S.includesFooter}>
              {S.includeOrder.map((key) => (
                <ToggleRow
                  key={key}
                  label={S.includes[key]}
                  on={includes[key]}
                  // At least one stays on (PREM-04 AC 3).
                  disabled={pending || (includes[key] && onlyOneOn)}
                  onChange={(on) => toggle(key, on)}
                />
              ))}
            </Section>

            {busy ? (
              <Text style={styles.error} accessibilityRole="alert">
                {S.busy}
              </Text>
            ) : null}
            {failed ? (
              <Text style={styles.error} accessibilityRole="alert">
                {S.failed}
              </Text>
            ) : null}

            <Pressable
              onPress={startExport}
              disabled={disabled}
              style={({ pressed }) => [
                styles.button,
                disabled && !pending && styles.buttonDisabled,
                pressed && styles.buttonPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ disabled, busy: pending }}
            >
              {pending ? <ActivityIndicator color={colors.onTint} /> : null}
              <Text style={[styles.buttonLabel, disabled && !pending && styles.buttonLabelOff]}>
                {label}
              </Text>
            </Pressable>

            <Text style={styles.note}>{S.deletedNote}</Text>
          </>
        )}
      </ScrollView>

      <OptionSheet
        visible={periodSheet}
        options={S.periodOrder.map((key) => ({ key, label: S.periods[key] }))}
        selected={period}
        onSelect={pickPeriod}
        onClose={() => setPeriodSheet(false)}
      />
      <MonthPickerSheet
        which={monthSheet}
        initial={monthSheet === 'from' ? (months.from ?? custom.from) : (months.to ?? custom.to)}
        latest={monthOf(now)}
        onSelect={(m) => monthSheet && pickMonth(monthSheet, m)}
        onClose={() => setMonthSheet(null)}
      />
    </>
  );
}

// --- rows -------------------------------------------------------------------------

function Section({
  header,
  footer,
  children,
}: {
  header: string;
  footer?: string;
  children: React.ReactNode;
}) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View>
      <Text style={styles.sectionLabel} accessibilityRole="header">
        {header}
      </Text>
      <View style={styles.listCard}>
        {items.map((child, i) => (
          <React.Fragment key={i}>
            {child}
            {i < items.length - 1 ? <View style={styles.separator} /> : null}
          </React.Fragment>
        ))}
      </View>
      {footer ? <Text style={styles.sectionFooter}>{footer}</Text> : null}
    </View>
  );
}

function NavRow({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  const { fontScale: scale } = useWindowDimensions();
  const stacked = scale >= fontScale.accessibility;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, stacked && styles.rowStacked, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text style={type.body}>{label}</Text>
      <View style={styles.navValue}>
        <Text style={styles.value}>{value}</Text>
        <SymbolView name="chevron.right" size={12} tintColor={colors.iosLabel3} />
      </View>
    </Pressable>
  );
}

function RadioRow({
  title,
  detail,
  selected,
  disabled,
  onPress,
}: {
  title: string;
  detail: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.row, styles.radioRow, pressed && styles.pressed]}
      accessibilityRole="radio"
      accessibilityLabel={`${title}, ${detail}`}
      accessibilityState={{ checked: selected, disabled }}
    >
      <View style={[styles.radio, selected && styles.radioOn]} />
      <View style={styles.rowText}>
        <Text style={styles.radioTitle}>{title}</Text>
        <Text style={styles.caption}>{detail}</Text>
      </View>
    </Pressable>
  );
}

function ToggleRow({
  label,
  on,
  disabled,
  onChange,
}: {
  label: string;
  on: boolean;
  disabled: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={[type.body, styles.rowText]}>{label}</Text>
      <AppSwitch
        value={on}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={label}
      />
    </View>
  );
}

// --- sheets -----------------------------------------------------------------------

function Sheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      {/* Taps only: accessible, these would hide the options from VoiceOver. */}
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessible={false}
        onAccessibilityEscape={onClose}
      >
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()} accessible={false}>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function OptionSheet<K extends string>({
  visible,
  options,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  options: { key: K; label: string }[];
  selected: K;
  onSelect: (key: K) => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose}>
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
    </Sheet>
  );
}

/** Pick a month: a year with ‹ › and its twelve months. Months after this one are off. */
function MonthPickerSheet({
  which,
  initial,
  latest,
  onSelect,
  onClose,
}: {
  which: 'from' | 'to' | null;
  initial: Month;
  latest: Month;
  onSelect: (month: Month) => void;
  onClose: () => void;
}) {
  const [year, setYear] = useState(initial.year);
  const [openFor, setOpenFor] = useState<'from' | 'to' | null>(null);
  if (which !== openFor) {
    // A new opening starts on the year of the month shown.
    setOpenFor(which);
    if (which) setYear(initial.year);
  }

  return (
    <Sheet visible={which !== null} onClose={onClose}>
      <View style={[styles.listCard, styles.monthCard]}>
        <Text style={styles.sheetTitle} accessibilityRole="header">
          {which ? S.monthPickerTitle(which) : ''}
        </Text>
        <View style={styles.yearRow}>
          <Pressable
            onPress={() => setYear((y) => y - 1)}
            style={styles.yearButton}
            accessibilityRole="button"
            accessibilityLabel={S.previousYear}
          >
            <SymbolView name="chevron.left" size={16} tintColor={colors.tint} />
          </Pressable>
          <Text style={type.headline}>{year}</Text>
          <Pressable
            onPress={() => setYear((y) => y + 1)}
            disabled={year >= latest.year}
            style={styles.yearButton}
            accessibilityRole="button"
            accessibilityLabel={S.nextYear}
            accessibilityState={{ disabled: year >= latest.year }}
          >
            <SymbolView
              name="chevron.right"
              size={16}
              tintColor={year >= latest.year ? colors.iosLabel3 : colors.tint}
            />
          </Pressable>
        </View>
        <View style={styles.monthGrid}>
          {S.monthsShort.map((short, i) => {
            const month = { year, month: i + 1 };
            const future = compareMonths(month, latest) > 0;
            const selected = compareMonths(month, initial) === 0;
            return (
              <Pressable
                key={short}
                onPress={() => onSelect(month)}
                disabled={future}
                style={[styles.monthCell, selected && styles.monthCellOn]}
                accessibilityRole="button"
                accessibilityLabel={`${S.monthsLong[i]} ${year}`}
                accessibilityState={{ selected, disabled: future }}
              >
                <Text
                  style={[
                    type.body,
                    selected && styles.monthLabelOn,
                    future && styles.monthLabelOff,
                  ]}
                >
                  {short}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          onPress={onClose}
          style={styles.closeButton}
          accessibilityRole="button"
          accessibilityLabel={S.close}
        >
          <Text style={styles.link}>{S.close}</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.screenBottom },
  loading: { marginTop: spacing.xl },
  card: {
    backgroundColor: colors.iosBg2,
    borderRadius: radii.list,
    padding: spacing.lg,
    gap: spacing.sm,
  },

  // Design: a tinted card with a tint icon tile and one line.
  intro: {
    backgroundColor: colors.tintBg,
    borderRadius: radii.button,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  introIcon: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  introText: { ...type.footnote, color: colors.iosLabel2, flex: 1 },

  sectionLabel: {
    ...type.footnote,
    color: colors.iosLabel2,
    letterSpacing: 0.5,
    paddingHorizontal: spacing.lg,
    paddingBottom: 6,
  },
  sectionFooter: {
    ...type.footnote,
    color: colors.iosLabel2,
    paddingHorizontal: spacing.lg,
    paddingTop: 6,
  },
  listCard: { backgroundColor: colors.iosBg2, borderRadius: radii.list, overflow: 'hidden' },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.iosSeparator,
    marginLeft: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: touchTarget.minHeight,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  rowStacked: { flexDirection: 'column', alignItems: 'flex-start', gap: spacing.xs },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.iosSeparator },
  rowText: { flex: 1, gap: 2 },
  pressed: { backgroundColor: colors.iosFill1 },
  navValue: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 },
  value: { ...type.body, color: colors.iosLabel2, flexShrink: 1 },
  caption: { ...type.caption1, color: colors.iosLabel2 },

  radioRow: { justifyContent: 'flex-start' },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.iosFill1,
  },
  radioOn: { borderWidth: 6, borderColor: colors.tint },
  radioTitle: { ...type.subheadline, fontWeight: '500' },

  note: { ...type.footnote, color: colors.iosLabel2, paddingHorizontal: spacing.lg },
  error: { ...type.footnote, color: colors.red, paddingHorizontal: spacing.lg },
  button: {
    // minHeight, not height: the label wraps at large text sizes.
    minHeight: 50,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.button,
    backgroundColor: colors.tint,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: { backgroundColor: colors.tintPressed },
  buttonDisabled: { backgroundColor: colors.iosFill1 },
  buttonLabel: { ...type.headline, color: colors.onTint, textAlign: 'center' },
  buttonLabelOff: { color: colors.iosLabel2 },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { padding: spacing.lg, paddingBottom: spacing.xxl, backgroundColor: 'transparent' },
  monthCard: { padding: spacing.lg, gap: spacing.md },
  sheetTitle: { ...type.headline, textAlign: 'center' },
  yearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  yearButton: {
    minWidth: touchTarget.minWidth,
    minHeight: touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  monthCell: {
    flexGrow: 1,
    flexBasis: '30%',
    minHeight: touchTarget.minHeight,
    borderRadius: radii.button,
    backgroundColor: colors.iosBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthCellOn: { backgroundColor: colors.tint },
  monthLabelOn: { color: colors.onTint, fontWeight: '600' },
  monthLabelOff: { color: colors.iosLabel3 },
  closeButton: { minHeight: touchTarget.minHeight, alignItems: 'center', justifyContent: 'center' },
  link: { ...type.body, color: colors.tint },
});

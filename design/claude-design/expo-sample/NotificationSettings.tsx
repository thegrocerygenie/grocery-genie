/**
 * NotificationSettings — Alert thresholds + weekly summary.
 *
 * Drop-in for `app/notification-settings.tsx`. Pushed (not modal) —
 * this is reached from a "Notifications" row inside main Settings.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Switch,
  StyleSheet,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { colors, type, radii, spacing } from './theme';

type State = {
  alert50: boolean;
  alert80: boolean;
  alert100: boolean;
  weekly: boolean;
  weeklyDay: 'Sunday' | 'Monday' | 'Saturday';
};

export default function NotificationSettings() {
  const router = useRouter();
  const [s, setS] = useState<State>({
    alert50: false,
    alert80: true,
    alert100: true,
    weekly: true,
    weeklyDay: 'Sunday',
  });

  const set = <K extends keyof State>(k: K, v: State[K]) =>
    setS((prev) => ({ ...prev, [k]: v }));

  return (
    <>
      <Stack.Screen options={{ title: 'Alerts' }} />
      <ScrollView
        style={styles.root}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
      >
        <Section
          header="BUDGET ALERTS"
          footer="We'll send a quiet notification once per threshold per month."
        >
          <ToggleRow label="50% of budget"  on={s.alert50}  onChange={(v) => set('alert50', v)} />
          <ToggleRow label="80% of budget"  on={s.alert80}  onChange={(v) => set('alert80', v)} />
          <ToggleRow label="100% of budget" on={s.alert100} onChange={(v) => set('alert100', v)} />
        </Section>

        <Section header="WEEKLY SUMMARY">
          <ToggleRow
            label="Send weekly summary"
            on={s.weekly}
            onChange={(v) => set('weekly', v)}
          />
          {s.weekly && (
            <NavRow
              label="Day"
              value={s.weeklyDay}
              onPress={() => {
                /* present action sheet to pick day */
              }}
            />
          )}
        </Section>
      </ScrollView>
    </>
  );
}

// ─── Reusable list primitives (same shape as BudgetSettings) ────

function Section({
  header,
  footer,
  children,
}: {
  header?: string;
  footer?: string;
  children: React.ReactNode;
}) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View>
      {header && <Text style={styles.sectionLabel}>{header}</Text>}
      <View style={styles.listCard}>
        {items.map((c, i) => (
          <React.Fragment key={i}>
            {c}
            {i < items.length - 1 && <View style={styles.separator} />}
          </React.Fragment>
        ))}
      </View>
      {footer && <Text style={styles.sectionFooter}>{footer}</Text>}
    </View>
  );
}

function ToggleRow({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={type.body}>{label}</Text>
      <Switch
        value={on}
        onValueChange={onChange}
        trackColor={{ false: colors.iosFill1, true: colors.green }}
        ios_backgroundColor={colors.iosFill1}
      />
    </View>
  );
}

function NavRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <Text style={type.body}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text style={[type.body, { color: colors.iosLabel2 }]}>{value}</Text>
        <SymbolView name="chevron.right" size={12} tintColor={colors.iosLabel3} />
      </View>
    </Pressable>
  );
}

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
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.iosSeparator,
    marginLeft: 16,
  },
});

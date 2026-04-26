import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { colors, radii, spacing, type } from '@/constants/theme';
import { useNotificationStore } from '@/store/notificationStore';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function NotificationSettingsScreen() {
  const { preferences, setThreshold, setWeeklySummaryEnabled, setWeeklySummaryDay } =
    useNotificationStore();
  const [dayPickerOpen, setDayPickerOpen] = useState(false);

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
          <ToggleRow
            label="50% of budget"
            on={preferences.fiftyPercent}
            onChange={(v) => setThreshold('fiftyPercent', v)}
          />
          <ToggleRow
            label="80% of budget"
            on={preferences.eightyPercent}
            onChange={(v) => setThreshold('eightyPercent', v)}
          />
          <ToggleRow
            label="100% of budget"
            on={preferences.hundredPercent}
            onChange={(v) => setThreshold('hundredPercent', v)}
          />
        </Section>

        <Section header="WEEKLY SUMMARY">
          <ToggleRow
            label="Send weekly summary"
            on={preferences.weeklySummaryEnabled}
            onChange={setWeeklySummaryEnabled}
          />
          {preferences.weeklySummaryEnabled ? (
            <NavRow
              label="Day"
              value={DAYS[preferences.weeklySummaryDay] ?? 'Sunday'}
              onPress={() => setDayPickerOpen(true)}
            />
          ) : null}
        </Section>
      </ScrollView>

      <DayPickerSheet
        visible={dayPickerOpen}
        selected={preferences.weeklySummaryDay}
        onSelect={(d) => {
          setWeeklySummaryDay(d);
          setDayPickerOpen(false);
        }}
        onClose={() => setDayPickerOpen(false)}
      />
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
}

function ToggleRow({ label, on, onChange }: ToggleRowProps) {
  return (
    <View style={styles.row}>
      <Text style={type.body}>{label}</Text>
      <Switch
        value={on}
        onValueChange={onChange}
        trackColor={{ false: colors.iosFill1, true: colors.green }}
        ios_backgroundColor={colors.iosFill1}
        accessibilityLabel={label}
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
        <Text style={[type.body, { color: colors.iosLabel2 as string }]}>{value}</Text>
        <SymbolView name="chevron.right" size={12} tintColor={colors.iosLabel3 as string} />
      </View>
    </Pressable>
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
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <Pressable style={sheetStyles.backdrop} onPress={onClose}>
        <Pressable style={sheetStyles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.listCard}>
            {DAYS.map((d, i) => (
              <Pressable
                key={d}
                onPress={() => onSelect(i)}
                style={[styles.row, i > 0 && styles.rowDivider]}
                accessibilityRole="button"
              >
                <Text style={type.body}>{d}</Text>
                {selected === i ? (
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
  root: { flex: 1, backgroundColor: colors.iosBg as string },

  sectionLabel: {
    ...type.footnote,
    color: colors.iosLabel2 as string,
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  sectionFooter: {
    ...type.footnote,
    color: colors.iosLabel2 as string,
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
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.iosSeparator,
    marginLeft: 16,
  },
});

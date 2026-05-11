import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { colors, radii, spacing, type } from '@/constants/theme';
import { useMe, useSignOut } from '@/features/auth/hooks/useAuth';

interface RowDef {
  key: string;
  symbol: string;
  iconBg: string;
  title: string;
  detail?: string;
  value?: string;
  href?: string;
}

const SPENDING_ROWS: RowDef[] = [
  {
    key: 'budget',
    symbol: 'cart.fill',
    iconBg: colors.green,
    title: 'Budgets',
    detail: 'Monthly limit · category caps',
    href: '/budget-settings',
  },
  {
    key: 'notifications',
    symbol: 'bell.fill',
    iconBg: colors.orange,
    title: 'Notifications',
    detail: 'Thresholds · weekly summary',
    href: '/notification-settings',
  },
];

const RECEIPT_ROWS: RowDef[] = [
  {
    key: 'language',
    symbol: 'character.book.closed.fill',
    iconBg: colors.indigo,
    title: 'Language',
    value: 'English',
    href: '/language-settings',
  },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { data: profile } = useMe();
  const signOut = useSignOut();

  const onSignOut = async () => {
    await signOut.mutateAsync();
    router.replace('/onboarding');
  };

  const initial = (profile?.name || profile?.email || 'G').charAt(0).toUpperCase();

  return (
    <>
      <Stack.Screen
        options={{
          presentation: 'modal',
          title: 'Settings',
          headerLargeTitle: true,
          headerRight: () => (
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Text style={styles.headerBtn}>Done</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={styles.root}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 80 }}
      >
        <Pressable
          onPress={() => router.push('/email-change')}
          style={styles.profileCard}
          accessibilityRole="button"
          accessibilityLabel="Account"
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={type.headline}>{profile?.name ?? 'Grocery Genie'}</Text>
            <Text style={[type.footnote, { color: colors.iosLabel2 as string }]}>
              {profile?.email ?? 'Loading…'} · Free plan
            </Text>
          </View>
          <SymbolView name="chevron.right" size={12} tintColor={colors.iosLabel3 as string} />
        </Pressable>

        <Section header="SPENDING">
          {SPENDING_ROWS.map((r, i) => (
            <SettingsRow
              key={r.key}
              row={r}
              showDivider={i > 0}
              onPress={() => r.href && router.push(r.href as never)}
            />
          ))}
        </Section>

        <Section header="RECEIPTS">
          {RECEIPT_ROWS.map((r, i) => (
            <SettingsRow
              key={r.key}
              row={r}
              showDivider={i > 0}
              onPress={() => r.href && router.push(r.href as never)}
            />
          ))}
        </Section>

        <Section header="ACCOUNT">
          <SettingsLinkRow
            title="Recently deleted"
            onPress={() => router.push('/recently-deleted')}
          />
          <SettingsLinkRow title="Change email" onPress={() => router.push('/email-change')} />
          <SettingsTextRow title="Privacy" />
          <SettingsTextRow title="Help & feedback" />
          <SettingsTextRow title="About" detail="v1.0.0" />
        </Section>

        <Pressable
          onPress={onSignOut}
          style={({ pressed }) => [styles.signOut, pressed && { backgroundColor: colors.iosFill3 }]}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <Text style={[type.body, { color: colors.red, fontWeight: '500' }]}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

interface SectionProps {
  header?: string;
  children: React.ReactNode;
}

function Section({ header, children }: SectionProps) {
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
    </View>
  );
}

interface SettingsRowProps {
  row: RowDef;
  showDivider: boolean;
  onPress: () => void;
}

function SettingsRow({ row, onPress }: SettingsRowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.iosFill3 }]}
      accessibilityRole="button"
      accessibilityLabel={row.title}
    >
      <View style={[styles.iconSquare, { backgroundColor: row.iconBg }]}>
        <SymbolView
          name={row.symbol as Parameters<typeof SymbolView>[0]['name']}
          size={14}
          tintColor="#fff"
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={type.body}>{row.title}</Text>
        {row.detail ? (
          <Text style={[type.caption1, { color: colors.iosLabel2 as string, marginTop: 1 }]}>
            {row.detail}
          </Text>
        ) : null}
      </View>
      {row.value ? (
        <Text style={[type.body, { color: colors.iosLabel2 as string }]}>{row.value}</Text>
      ) : null}
      <SymbolView name="chevron.right" size={12} tintColor={colors.iosLabel3 as string} />
    </Pressable>
  );
}

interface SettingsTextRowProps {
  title: string;
  detail?: string;
}

function SettingsTextRow({ title, detail }: SettingsTextRowProps) {
  return (
    <View style={styles.row}>
      <Text style={[type.body, { flex: 1 }]}>{title}</Text>
      {detail ? (
        <Text style={[type.body, { color: colors.iosLabel2 as string }]}>{detail}</Text>
      ) : null}
      <SymbolView name="chevron.right" size={12} tintColor={colors.iosLabel3 as string} />
    </View>
  );
}

interface SettingsLinkRowProps {
  title: string;
  onPress: () => void;
}

function SettingsLinkRow({ title, onPress }: SettingsLinkRowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.iosFill3 }]}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <Text style={[type.body, { flex: 1 }]}>{title}</Text>
      <SymbolView name="chevron.right" size={12} tintColor={colors.iosLabel3 as string} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg },
  headerBtn: { ...type.body, color: colors.tint, fontWeight: '600' },

  profileCard: {
    backgroundColor: colors.iosBg2,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...type.headline,
    color: '#fff',
    fontFamily: 'System',
  },

  sectionLabel: {
    ...type.footnote,
    color: colors.iosLabel2 as string,
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingBottom: 6,
  },

  listCard: {
    backgroundColor: colors.iosBg2,
    borderRadius: radii.list,
    overflow: 'hidden',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
    minHeight: 44,
  },
  iconSquare: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.iosSeparator,
    marginLeft: 16,
  },

  signOut: {
    height: 44,
    borderRadius: radii.list,
    backgroundColor: colors.iosBg2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

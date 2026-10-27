import React from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { colors, radii, spacing, type } from '@/constants/theme';

import { AI_CONSENT_SETTINGS_COPY as COPY } from '../constants';
import { useAiConsentGate, useAiConsentStatus, useWithdrawAiConsent } from '../hooks/useAiConsent';

/**
 * Settings → Read receipts with AI. Off asks first, then withdraws consent on
 * the server. On opens the consent sheet, so the user reads what is sent
 * before allowing it.
 */
export function AiConsentSettingsSection() {
  const granted = useAiConsentStatus() === true;
  const withdraw = useWithdrawAiConsent();
  const { askForConsent } = useAiConsentGate();

  const turnOff = () => {
    Alert.alert(COPY.offTitle, COPY.offMessage, [
      { text: COPY.cancel, style: 'cancel' },
      {
        text: COPY.offConfirm,
        style: 'destructive',
        onPress: () => {
          withdraw.mutateAsync().catch(() => {
            Alert.alert(COPY.offFailedTitle, COPY.offFailedMessage);
          });
        },
      },
    ]);
  };

  const onValueChange = (on: boolean) => {
    if (on) void askForConsent();
    else turnOff();
  };

  return (
    <View>
      <Text style={styles.sectionLabel}>{COPY.header}</Text>
      <View style={styles.listCard}>
        <View style={styles.row}>
          <View style={styles.iconSquare}>
            <SymbolView name="sparkles" size={14} tintColor="#fff" />
          </View>
          <Text style={[type.body, styles.title]}>{COPY.title}</Text>
          <Switch
            value={granted}
            onValueChange={onValueChange}
            disabled={withdraw.isPending}
            trackColor={{ false: colors.iosFill1, true: colors.green }}
            ios_backgroundColor={colors.iosFill1}
            accessibilityLabel={COPY.title}
          />
        </View>
      </View>
      <Text style={styles.footer}>{COPY.footer}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    ...type.footnote,
    color: colors.iosLabel2,
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
    backgroundColor: colors.indigo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1 },
  footer: {
    ...type.footnote,
    color: colors.iosLabel2,
    paddingHorizontal: 16,
    paddingTop: spacing.xs + 2,
  },
});

import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';

import { colors, radii, spacing, type } from '@/constants/theme';
import { useBudgetCreate } from '@/features/budget/hooks/useBudget';

export default function OnboardingBudget() {
  const router = useRouter();
  const budgetCreate = useBudgetCreate();
  const [amount, setAmount] = useState('400');
  const [saving, setSaving] = useState(false);

  const onContinue = async (skipPersist = false) => {
    if (!skipPersist) {
      const parsed = parseFloat(amount);
      if (Number.isFinite(parsed) && parsed > 0) {
        setSaving(true);
        try {
          const now = new Date();
          const periodStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
          await budgetCreate.mutateAsync({
            category_id: null,
            amount: parsed,
            period_type: 'monthly',
            period_start: periodStart,
          });
        } catch {
          Alert.alert('Could not save budget', 'You can set one later in Settings.');
        } finally {
          setSaving(false);
        }
      }
    }
    router.push('/onboarding/camera');
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Set Budget',
          headerBackTitle: 'Back',
          headerRight: () => (
            <Pressable onPress={() => onContinue(true)} hitSlop={12} disabled={saving}>
              <Text style={styles.headerBtn}>Skip</Text>
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={[styles.root, { padding: spacing.lg }]}>
          <Text style={styles.sectionLabel}>MONTHLY BUDGET</Text>
          <View style={styles.amountCard}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'baseline',
                justifyContent: 'center',
              }}
            >
              <Text style={styles.amountCurrency}>$</Text>
              <TextInput
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
                style={styles.amountInput}
                maxLength={6}
                accessibilityLabel="Monthly budget amount"
              />
            </View>
            <Text style={styles.amountHint}>You can change this anytime.</Text>
          </View>
          <View style={{ flex: 1 }} />
          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              pressed && { backgroundColor: colors.tintPressed },
              saving && { opacity: 0.6 },
            ]}
            onPress={() => onContinue(false)}
            disabled={saving}
            accessibilityRole="button"
          >
            <Text style={styles.primaryBtnLabel}>Continue</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg as string },
  headerBtn: { ...type.body, color: colors.tint },

  sectionLabel: {
    ...type.footnote,
    color: colors.iosLabel2 as string,
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
  },
  amountCard: {
    backgroundColor: colors.iosBg2,
    borderRadius: radii.list,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  amountCurrency: {
    ...type.money,
    fontSize: 32,
    color: colors.iosLabel3 as string,
  },
  amountInput: {
    ...type.money,
    fontSize: 56,
    color: colors.iosLabel as string,
    minWidth: 120,
    textAlign: 'center',
    padding: 0,
  },
  amountHint: {
    ...type.footnote,
    color: colors.iosLabel2 as string,
    textAlign: 'center',
  },

  primaryBtn: {
    height: 50,
    borderRadius: radii.button,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnLabel: { color: '#fff', ...type.headline },
});

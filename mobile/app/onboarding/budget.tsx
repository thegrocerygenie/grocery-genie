import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';

import { colors, radii, spacing, type } from '@/constants/theme';
import { useBudgetCreate } from '@/features/budget/hooks/useBudget';

// The amount is one line in a fixed-width card, and Skip sits in the
// fixed-height nav bar. Neither can wrap, so both stop growing here.
const AMOUNT_MAX_FONT_SCALE = 1.3;
const HEADER_BUTTON_MAX_FONT_SCALE = 1.3;

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
              <Text style={styles.headerBtn} maxFontSizeMultiplier={HEADER_BUTTON_MAX_FONT_SCALE}>
                Skip
              </Text>
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={styles.root}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          alwaysBounceVertical={false}
        >
          <Text style={styles.sectionLabel}>MONTHLY BUDGET</Text>
          <View style={styles.amountCard}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'baseline',
                justifyContent: 'center',
              }}
            >
              <Text style={styles.amountCurrency} maxFontSizeMultiplier={AMOUNT_MAX_FONT_SCALE}>
                $
              </Text>
              <TextInput
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
                style={styles.amountInput}
                maxLength={6}
                maxFontSizeMultiplier={AMOUNT_MAX_FONT_SCALE}
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
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg },
  scrollContent: { flexGrow: 1, padding: spacing.lg },
  headerBtn: { ...type.body, color: colors.tint, paddingHorizontal: spacing.xs },

  sectionLabel: {
    ...type.footnote,
    color: colors.iosLabel2,
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
    color: colors.iosLabel3,
  },
  amountInput: {
    ...type.money,
    fontSize: 56,
    color: colors.iosLabel,
    minWidth: 120,
    textAlign: 'center',
    padding: 0,
  },
  amountHint: {
    ...type.footnote,
    color: colors.iosLabel2,
    textAlign: 'center',
  },

  primaryBtn: {
    minHeight: 50,
    paddingVertical: spacing.sm,
    borderRadius: radii.button,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnLabel: { ...type.headline, color: colors.onTint },
});

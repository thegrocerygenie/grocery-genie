import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { colors, radii, spacing, touchTarget, type } from '@/constants/theme';
import { WAITLIST_OFFER_STRINGS as S } from '@/features/premium/content/waitlistOffer';
import {
  useRequestWaitlistClaim,
  useWaitlistOffer,
} from '@/features/premium/hooks/useWaitlistOffer';
import {
  claimErrorMessage,
  isPlausibleEmail,
  offerDate,
} from '@/features/premium/utils/waitlistOffer';

/**
 * Settings → "Claim your waitlist offer" (V11-P5). For an account whose email
 * is not the one it joined the waitlist with (Hide My Email, or another
 * address): the user enters the waitlist email and taps the link the server
 * sends to it. The server decides who qualifies; the screen only asks.
 */
export default function WaitlistOfferScreen() {
  const offer = useWaitlistOffer();
  const request = useRequestWaitlistClaim();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);

  const canSend = isPlausibleEmail(email) && !request.isPending;
  const onSend = () => {
    if (!canSend) return;
    const to = email.trim();
    request.mutate(to, { onSuccess: () => setSentTo(to) });
  };

  const data = offer.data;
  let body: React.ReactNode;
  if (offer.isLoading) {
    body = <ActivityIndicator color={colors.tint} style={styles.loading} />;
  } else if (offer.isError || !data) {
    body = (
      <View style={styles.card}>
        <Text style={styles.error} accessibilityRole="alert">
          {S.loadFailed}
        </Text>
        <Pressable
          onPress={() => offer.refetch()}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryPressed]}
          accessibilityRole="button"
          accessibilityLabel={S.retry}
        >
          <Text style={styles.secondaryLabel}>{S.retry}</Text>
        </Pressable>
      </View>
    );
  } else if (data.redemption) {
    const granted = data.redemption.status === 'granted';
    body = (
      <Hero
        symbol={granted ? 'checkmark.seal.fill' : 'hourglass'}
        title={granted ? S.grantedTitle : S.pendingTitle}
        message={granted ? S.grantedBody(offerDate(data.redemption.expires_at)) : S.pendingBody}
      />
    );
  } else if (!data.claim_available) {
    body = (
      <Hero symbol="calendar.badge.exclamationmark" title={S.heading} message={S.closedBody} />
    );
  } else if (sentTo) {
    body = (
      <>
        <Hero symbol="envelope.open.fill" title={S.sentTitle} message={S.sentBody(sentTo)} />
        <Pressable
          onPress={() => {
            setSentTo(null);
            request.reset();
          }}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryPressed]}
          accessibilityRole="button"
          accessibilityLabel={S.sendAgain}
        >
          <Text style={styles.secondaryLabel}>{S.sendAgain}</Text>
        </Pressable>
      </>
    );
  } else {
    body = (
      <>
        <Hero symbol="gift.fill" title={S.heading} message={S.intro} />
        {data.closes_at ? (
          <Text style={styles.note}>{S.closesOn(offerDate(data.closes_at))}</Text>
        ) : null}
        <View style={styles.inputCard}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder={S.emailPlaceholder}
            placeholderTextColor={colors.iosLabel3}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="send"
            onSubmitEditing={onSend}
            editable={!request.isPending}
            style={styles.input}
            accessibilityLabel={S.emailLabel}
          />
        </View>
        {request.isError ? (
          <Text style={styles.error} accessibilityRole="alert">
            {claimErrorMessage(request.error)}
          </Text>
        ) : null}
        <Pressable
          onPress={onSend}
          disabled={!canSend}
          style={({ pressed }) => [
            styles.button,
            !canSend && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={S.send}
          accessibilityState={{ disabled: !canSend, busy: request.isPending }}
        >
          {request.isPending ? <ActivityIndicator color={colors.onTint} /> : null}
          <Text style={styles.buttonLabel}>{request.isPending ? S.sending : S.send}</Text>
        </Pressable>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: S.screenTitle, headerBackTitle: S.backTitle }} />
      <KeyboardAvoidingView behavior="padding" style={styles.root}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {body}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

function Hero({ symbol, title, message }: { symbol: string; title: string; message: string }) {
  return (
    <View style={styles.hero}>
      <View style={styles.iconWrap}>
        <SymbolView
          name={symbol as Parameters<typeof SymbolView>[0]['name']}
          size={28}
          tintColor={colors.tint}
        />
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.body}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 80 },
  loading: { marginTop: spacing.xl },
  hero: { alignItems: 'center', gap: spacing.sm },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 14,
    backgroundColor: colors.iosFill3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...type.title2, textAlign: 'center' },
  body: { ...type.subheadline, color: colors.iosLabel2, textAlign: 'center', maxWidth: 320 },
  card: {
    backgroundColor: colors.iosBg2,
    borderRadius: radii.list,
    padding: spacing.lg,
    gap: spacing.md,
  },
  inputCard: {
    backgroundColor: colors.iosBg2,
    borderRadius: radii.list,
    paddingHorizontal: spacing.lg,
  },
  input: {
    ...type.body,
    color: colors.iosLabel,
    minHeight: touchTarget.minHeight,
    paddingVertical: spacing.md,
  },
  note: { ...type.footnote, color: colors.iosLabel2, textAlign: 'center' },
  error: { ...type.footnote, color: colors.red, paddingHorizontal: spacing.lg },
  button: {
    // minHeight, not height: the label wraps at large text sizes.
    minHeight: touchTarget.minHeight,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.button,
    backgroundColor: colors.tint,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonPressed: { backgroundColor: colors.tintPressed },
  buttonLabel: { ...type.headline, color: colors.onTint },
  secondaryButton: {
    minHeight: touchTarget.minHeight,
    paddingVertical: spacing.sm,
    borderRadius: radii.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryPressed: { backgroundColor: colors.iosFill3 },
  secondaryLabel: { ...type.body, color: colors.tint, fontWeight: '600' },
});

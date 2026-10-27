import React from 'react';
import { Stack } from 'expo-router';

import { PrivacyPolicy } from '@/features/settings/components/PrivacyPolicy';

/**
 * The privacy policy, opened from sign-up. It lives under onboarding/ because
 * a signed-out user can open only onboarding routes.
 */
export default function OnboardingPrivacyScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Privacy Policy', headerBackTitle: 'Back' }} />
      <PrivacyPolicy />
    </>
  );
}

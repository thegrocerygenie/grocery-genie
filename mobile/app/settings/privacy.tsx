import React from 'react';
import { Stack } from 'expo-router';

import { PrivacyPolicy } from '@/features/settings/components/PrivacyPolicy';

/** Settings → Privacy: the privacy policy, in the app. */
export default function PrivacyScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Privacy', headerBackTitle: 'Settings' }} />
      <PrivacyPolicy />
    </>
  );
}

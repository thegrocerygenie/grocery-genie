import React from 'react';
import { Stack } from 'expo-router';

/**
 * Settings and the screens it opens share one stack, presented as a single
 * modal from the root. iOS presents a root-stack screen opened over a modal as
 * another modal with no Back button; inside this stack they push, with Back.
 */
export default function SettingsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Settings' }} />
      <Stack.Screen name="notification-settings" options={{ title: 'Alerts' }} />
      <Stack.Screen name="language-settings" options={{ title: 'Receipt Languages' }} />
      <Stack.Screen name="about" options={{ title: 'About' }} />
      <Stack.Screen name="help" options={{ title: 'Help & feedback' }} />
      <Stack.Screen name="privacy" options={{ title: 'Privacy' }} />
      <Stack.Screen name="delete-account" options={{ title: 'Delete account' }} />
    </Stack>
  );
}

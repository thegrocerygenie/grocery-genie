import React from 'react';
import { View } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Redirect, Stack, useSegments } from 'expo-router';
import 'react-native-reanimated';

import { colors } from '@/constants/theme';
import { useSyncQueue } from '@/hooks/useSyncQueue';
import { useOnboardingStore } from '@/store/onboardingStore';

const queryClient = new QueryClient();

function SyncQueueProvider() {
  useSyncQueue();
  return null;
}

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { hasOnboarded, hydrated } = useOnboardingStore();
  const segments = useSegments();
  const inOnboarding = segments[0] === 'onboarding';

  if (!hydrated) {
    return <View style={{ flex: 1, backgroundColor: colors.iosBg as string }} />;
  }

  if (!hasOnboarded && !inOnboarding) {
    return <Redirect href="/onboarding" />;
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SyncQueueProvider />
      <OnboardingGate>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen
            name="review"
            options={{ title: 'Review Receipt', presentation: 'modal' }}
          />
          <Stack.Screen
            name="budget-settings"
            options={{ title: 'Budget Settings', presentation: 'modal' }}
          />
          <Stack.Screen
            name="notification-settings"
            options={{ title: 'Notification Settings', presentation: 'modal' }}
          />
        </Stack>
      </OnboardingGate>
    </QueryClientProvider>
  );
}

import React, { useEffect } from 'react';
import { View } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Redirect, Stack, useSegments } from 'expo-router';
import 'react-native-reanimated';

import { colors } from '@/constants/theme';
import { useMe } from '@/features/auth/hooks/useAuth';
import { useSyncQueue } from '@/hooks/useSyncQueue';
import { useAuthStore } from '@/store/authStore';

const queryClient = new QueryClient();

function SyncQueueProvider() {
  useSyncQueue();
  return null;
}

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const hydrated = useAuthStore((s) => s.hydrated);
  const hydrate = useAuthStore((s) => s.hydrate);
  const segments = useSegments();
  const inOnboarding = segments[0] === 'onboarding';
  const me = useMe(!!accessToken);

  useEffect(() => {
    if (!hydrated) {
      void hydrate();
    }
  }, [hydrated, hydrate]);

  if (!hydrated) {
    return <View style={{ flex: 1, backgroundColor: colors.iosBg as string }} />;
  }

  if (!accessToken && !inOnboarding) {
    return <Redirect href="/onboarding" />;
  }

  if (accessToken && me.data?.needs_onboarding && !inOnboarding) {
    return <Redirect href="/onboarding/budget" />;
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
          <Stack.Screen name="settings" options={{ title: 'Settings', presentation: 'modal' }} />
          <Stack.Screen name="language-settings" options={{ title: 'Language' }} />
          <Stack.Screen
            name="manual-entry"
            options={{ title: 'Manual Entry', presentation: 'modal' }}
          />
          <Stack.Screen name="top-items" options={{ title: 'Top Items' }} />
          <Stack.Screen name="trend" options={{ title: 'Trend' }} />
          <Stack.Screen
            name="email-change"
            options={{ title: 'Change Email', presentation: 'modal' }}
          />
          <Stack.Screen
            name="recently-deleted"
            options={{ title: 'Recently Deleted', presentation: 'modal' }}
          />
        </Stack>
      </OnboardingGate>
    </QueryClientProvider>
  );
}

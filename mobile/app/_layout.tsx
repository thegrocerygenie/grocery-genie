import React, { useEffect } from 'react';
import { useColorScheme, View } from 'react-native';
import { ThemeProvider } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Redirect, Stack, useSegments } from 'expo-router';
import 'react-native-reanimated';

import { APP_FONTS } from '@/constants/fonts';
import { colors, navigationTheme } from '@/constants/theme';
import { useMe } from '@/features/auth/hooks/useAuth';
import { usePushNotifications } from '@/features/notifications/hooks/usePushNotifications';
import { useSyncQueue } from '@/hooks/useSyncQueue';
import { useAuthStore } from '@/store/authStore';

const queryClient = new QueryClient();

function SyncQueueProvider() {
  useSyncQueue();
  return null;
}

function PushNotificationsProvider() {
  usePushNotifications();
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
    return <View style={{ flex: 1, backgroundColor: colors.iosBg }} />;
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
  // The wordmark font ships in the bundle, so this resolves on the first frames.
  // If it fails, render anyway: iOS falls back to the system font.
  const [fontsLoaded, fontError] = useFonts(APP_FONTS);
  // Native stack headers read their colors from this theme; with none they stay light in dark mode.
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, backgroundColor: colors.iosBg }} />;
  }

  return (
    <ThemeProvider value={navigationTheme(scheme)}>
      <QueryClientProvider client={queryClient}>
        <SyncQueueProvider />
        <PushNotificationsProvider />
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
            <Stack.Screen name="settings" options={{ presentation: 'modal', headerShown: false }} />
            <Stack.Screen
              name="receipt/[id]"
              options={{ title: 'Receipt', headerBackTitle: 'History' }}
            />
            <Stack.Screen
              name="manual-entry"
              options={{ title: 'Manual Entry', presentation: 'modal' }}
            />
            <Stack.Screen
              name="ai-consent"
              options={{ presentation: 'modal', headerShown: false }}
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
    </ThemeProvider>
  );
}

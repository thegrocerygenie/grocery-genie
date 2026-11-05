import React, { useEffect } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { ThemeProvider } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Redirect, Stack, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { APP_FONTS } from '@/constants/fonts';
import { colors, navigationTheme } from '@/constants/theme';
import { useMe } from '@/features/auth/hooks/useAuth';
import { usePushNotifications } from '@/features/notifications/hooks/usePushNotifications';
import { useSyncQueue } from '@/hooks/useSyncQueue';
import { RouteTracker } from '@/components/RouteTracker';
import { useAuthStore } from '@/store/authStore';

// A push tap or link that launches the app opens its screen (an item, a
// receipt) with the tabs under it, so Back always leads into the app.
export const unstable_settings = {
  initialRouteName: '(tabs)',
};

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

  // Gesture handler needs one root view, for the History row swipe (L6).
  return (
    <GestureHandlerRootView style={styles.root}>
      <ThemeProvider value={navigationTheme(scheme)}>
        <QueryClientProvider client={queryClient}>
          <SyncQueueProvider />
          <RouteTracker />
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
                name="settings"
                options={{ presentation: 'modal', headerShown: false }}
              />
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
              <Stack.Screen name="items/index" options={{ title: 'Items' }} />
              <Stack.Screen name="items/[id]" options={{ title: 'Item' }} />
              <Stack.Screen name="items/alerts" options={{ title: 'Alerts' }} />
              <Stack.Screen
                name="price-alerts"
                options={{ title: 'Price alerts', headerBackTitle: 'Budget' }}
              />
              <Stack.Screen name="items/matches" options={{ title: 'Review Matches' }} />
              <Stack.Screen
                name="items/merge"
                options={{ title: 'Link items', presentation: 'modal' }}
              />
              <Stack.Screen
                name="items/split"
                options={{ title: 'Split', presentation: 'modal' }}
              />
              <Stack.Screen
                name="items/match"
                options={{ title: 'Same item?', presentation: 'fullScreenModal' }}
              />
              <Stack.Screen
                name="email-change"
                options={{ title: 'Change Email', presentation: 'modal' }}
              />
              <Stack.Screen
                name="recently-deleted"
                options={{ title: 'Recently Deleted', presentation: 'modal' }}
              />
              <Stack.Screen name="paywall" options={{ title: 'Premium', presentation: 'modal' }} />
            </Stack>
            {/* After the Stack: a tap that launched the app is routed on the first
                run, and it must land on the mounted Stack, over the tabs. */}
            <PushNotificationsProvider />
          </OnboardingGate>
        </QueryClientProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

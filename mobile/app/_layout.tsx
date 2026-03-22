import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import 'react-native-reanimated';

import { useSyncQueue } from '@/hooks/useSyncQueue';

const queryClient = new QueryClient();

function SyncQueueProvider() {
  useSyncQueue();
  return null;
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SyncQueueProvider />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="review"
          options={{
            title: 'Review Receipt',
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="budget-settings"
          options={{
            title: 'Budget Settings',
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="notification-settings"
          options={{
            title: 'Notification Settings',
            presentation: 'modal',
          }}
        />
      </Stack>
    </QueryClientProvider>
  );
}

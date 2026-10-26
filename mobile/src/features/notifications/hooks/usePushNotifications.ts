import { useEffect } from 'react';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { type Href, useRootNavigationState, useRouter } from 'expo-router';

import { useAuthStore } from '@/store/authStore';
import { usePushStore } from '@/store/pushStore';
import { parseNotificationTap } from '../notificationTap';
import { registerForPush, type PermissionStatus, type PushDeps } from '../registerForPush';
import { markNotificationRead, registerPushToken } from '../services/pushApi';

// Show alerts that arrive while the app is open, too.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const expoPushDeps: PushDeps = {
  getPermissionStatus: async () =>
    (await Notifications.getPermissionsAsync()).status as PermissionStatus,
  requestPermission: async () =>
    (await Notifications.requestPermissionsAsync()).status as PermissionStatus,
  getExpoPushToken: async (projectId) =>
    (await Notifications.getExpoPushTokenAsync({ projectId })).data,
  register: registerPushToken,
};

function easProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/**
 * Registers this device for push after sign-in, and opens the right screen
 * when the user taps a push (including one that launched the app).
 */
export function usePushNotifications(): void {
  const accessToken = useAuthStore((s) => s.accessToken);
  const setToken = usePushStore((s) => s.setToken);
  const router = useRouter();
  const navigationReady = !!useRootNavigationState()?.key;
  const lastResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (!accessToken) return;
    void registerForPush(easProjectId(), expoPushDeps).then((token) => {
      if (token) setToken(token);
    });
  }, [accessToken, setToken]);

  useEffect(() => {
    if (!lastResponse || !accessToken || !navigationReady) return;
    if (lastResponse.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;

    const { notificationId, route } = parseNotificationTap(
      lastResponse.notification.request.content.data,
    );
    if (notificationId) {
      void markNotificationRead(notificationId, 'push').catch(() => undefined);
    }
    router.push(route as Href);
    // Handle each tap once, even if this hook remounts.
    void Notifications.clearLastNotificationResponseAsync();
  }, [lastResponse, accessToken, navigationReady, router]);
}

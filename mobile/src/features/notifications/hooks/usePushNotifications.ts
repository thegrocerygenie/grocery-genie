import { useEffect, useState } from 'react';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { type Href, useNavigationContainerRef, useRouter, useSegments } from 'expo-router';

import { useMe } from '@/features/auth/hooks/useAuth';
import { cachedNeedsOnboarding, useAuthStore } from '@/store/authStore';
import { usePushStore } from '@/store/pushStore';
import { parseNotificationTap } from '../notificationTap';
import { captureTaps, takeTap, usePendingTapStore } from '../pendingTap';
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
 * True once React Navigation can take a navigation. A tap that launched the app
 * is already waiting on the first frame, before the root stack is ready, and
 * pushing then throws. The container ref has no ready event, so check each
 * frame until it is.
 */
function useNavigationReady(): boolean {
  const navigation = useNavigationContainerRef();
  const [ready, setReady] = useState(() => navigation.isReady());

  useEffect(() => {
    if (ready) return;
    let frame = requestAnimationFrame(function check() {
      if (navigation.isReady()) setReady(true);
      else frame = requestAnimationFrame(check);
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, navigation]);

  return ready;
}

/**
 * Registers this device for push after sign-in, and opens the right screen
 * when the user taps a push (including one that launched the app).
 *
 * A tap is opened only once the app can keep it on screen (BUG-6): the
 * session is read from the keychain and present, the root stack is ready, and
 * the profile says onboarding is done and the user is off the onboarding
 * screens. Opened earlier, the gate's needs_onboarding redirect would cover
 * it, and the user lands in onboarding with the tap spent.
 *
 * Before the profile loads, the onboarding state the device remembers for
 * this account answers instead (DA-14), so an onboarded user's tap opens at
 * once offline rather than after the ~7 s of profile retries. With nothing
 * remembered (or onboarding remembered as due), the tap waits for the
 * profile, and opens if it gives up. A tap
 * opened on either guess is settled by the next profile (`settleOnboarding`).
 */
export function usePushNotifications(): void {
  const accessToken = useAuthStore((s) => s.accessToken);
  const setToken = usePushStore((s) => s.setToken);
  const router = useRouter();
  const navigationReady = useNavigationReady();
  const inOnboarding = useSegments()[0] === 'onboarding';
  const pending = usePendingTapStore((s) => s.pending);
  const remembered = useAuthStore(cachedNeedsOnboarding);
  const me = useMe(!!accessToken);
  // The profile decides. Before it loads, a remembered "done" opens the tap
  // at once; otherwise the tap waits until the profile request gives up.
  const confirmed = me.data !== undefined;
  const onboarded = confirmed ? !me.data.needs_onboarding : remembered === false || me.isError;

  useEffect(() => {
    // Pick up a tap iOS stored before this mounted, if the listener missed it.
    captureTaps();
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    void registerForPush(easProjectId(), expoPushDeps).then((token) => {
      if (token) setToken(token);
    });
  }, [accessToken, setToken]);

  useEffect(() => {
    if (!pending || !accessToken || !onboarded || !navigationReady || inOnboarding) return;
    const response = takeTap(confirmed);
    if (!response) return;

    const { notificationId, route } = parseNotificationTap(
      response.notification.request.content.data,
    );
    if (notificationId) {
      void markNotificationRead(notificationId, 'push').catch(() => undefined);
    }
    // withAnchor: if the tap lands while the root stack is still being built,
    // the stack gets its initialRouteName (the tabs) under the item, so Back
    // returns to Budget (BUG-6). Into a built stack this is a plain push.
    router.push(route as Href, { withAnchor: true });
  }, [pending, accessToken, onboarded, confirmed, navigationReady, inOnboarding, router]);
}

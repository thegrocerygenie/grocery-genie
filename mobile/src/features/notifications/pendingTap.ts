import * as Notifications from 'expo-notifications';
import { create } from 'zustand';

/**
 * The push tap waiting to be opened (BUG-6).
 *
 * A tap that launches the app reaches JS long before the app can open it: the
 * session is still in the keychain, the root stack is not built, or the user
 * is on sign-in. The tap is held here, outside any screen, so a remount of the
 * root layout or the onboarding gate neither loses it nor sees it twice. Each
 * tap (by its iOS request identifier) is handed out at most once per launch.
 */
interface PendingTapState {
  pending: Notifications.NotificationResponse | null;
}

export const usePendingTapStore = create<PendingTapState>()(() => ({ pending: null }));

const taken = new Set<string>();

function tapId(response: Notifications.NotificationResponse): string {
  return response.notification.request.identifier;
}

/** Hold a tap on a push, unless it was opened already this launch. */
export function offerTap(response: Notifications.NotificationResponse | null | undefined): void {
  if (!response) return;
  if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
  const id = tapId(response);
  if (taken.has(id)) return;
  const { pending } = usePendingTapStore.getState();
  if (pending && tapId(pending) === id) return;
  usePendingTapStore.setState({ pending: response });
}

/** Hand out the waiting tap, once; later offers of the same tap are ignored. */
export function takeTap(): Notifications.NotificationResponse | null {
  const { pending } = usePendingTapStore.getState();
  if (!pending) return null;
  taken.add(tapId(pending));
  usePendingTapStore.setState({ pending: null });
  try {
    Notifications.clearLastNotificationResponse();
  } catch {
    // Not available on this platform; `taken` already stops a repeat.
  }
  return pending;
}

let listening = false;

/**
 * Listen for taps, then read the one iOS stored at launch. Listening first
 * closes the gap where a tap lands between the read and the subscription.
 * Safe to call again: it re-reads the stored tap, and repeats are dropped.
 */
export function captureTaps(): void {
  if (!listening) {
    Notifications.addNotificationResponseReceivedListener(offerTap);
    listening = true;
  }
  try {
    offerTap(Notifications.getLastNotificationResponse());
  } catch {
    // Not available on this platform.
  }
}

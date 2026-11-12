import * as Notifications from 'expo-notifications';
import { create } from 'zustand';

import { tokenSubject } from '@/features/auth/utils/tokenSubject';
import { useAuthStore } from '@/store/authStore';

/**
 * The push tap waiting to be opened (BUG-6).
 *
 * A tap that launches the app reaches JS long before the app can open it: the
 * session is still in the keychain, the root stack is not built, or the user
 * is on sign-in. The tap is held here, outside any screen, so a remount of the
 * root layout or the onboarding gate neither loses it nor sees it twice. Each
 * tap (by its iOS request identifier) is handed out at most once per launch.
 * A tap belongs to the account it was sent to: one made while signed out is
 * ignored, and signing out or another account signing in drops a held one.
 *
 * A tap opened before the profile confirmed onboarding is done (on the state
 * the device remembers, or because the profile request gave up) stays
 * `unconfirmed` (DA-14). If the profile then says onboarding is due, the
 * onboarding redirect covers the item, so the tap is held again and opens
 * once onboarding is finished.
 */
interface PendingTapState {
  pending: Notifications.NotificationResponse | null;
  unconfirmed: Notifications.NotificationResponse | null;
}

export const usePendingTapStore = create<PendingTapState>()(() => ({
  pending: null,
  unconfirmed: null,
}));

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
  if (signedOut()) {
    spend(id); // never opened later, even when the stored tap is read again
    return;
  }
  const { pending } = usePendingTapStore.getState();
  if (pending && tapId(pending) === id) return;
  usePendingTapStore.setState({ pending: response });
}

/** Mark a tap used for this launch, and clear the one iOS stored. */
function spend(id: string): void {
  taken.add(id);
  try {
    Notifications.clearLastNotificationResponse();
  } catch {
    // Not available on this platform; `taken` already stops a repeat.
  }
}

/**
 * Hand out the waiting tap, once; later offers of the same tap are ignored.
 * `confirmed` says whether the profile has confirmed onboarding is done; when
 * it has not, the tap is kept aside until it does (see `settleOnboarding`).
 */
export function takeTap(confirmed = true): Notifications.NotificationResponse | null {
  const { pending } = usePendingTapStore.getState();
  if (!pending) return null;
  spend(tapId(pending));
  usePendingTapStore.setState({ pending: null, unconfirmed: confirmed ? null : pending });
  return pending;
}

/**
 * The profile answered. If onboarding is due, a tap opened before that answer
 * is held again, to open after onboarding; either way it is settled.
 */
export function settleOnboarding(needsOnboarding: boolean): void {
  const { unconfirmed } = usePendingTapStore.getState();
  if (!unconfirmed) return;
  usePendingTapStore.setState(
    needsOnboarding ? { pending: unconfirmed, unconfirmed: null } : { unconfirmed: null },
  );
}

function signedOut(): boolean {
  const { hydrated, accessToken } = useAuthStore.getState();
  return hydrated && !accessToken;
}

function differs(a: string | null, b: string | null): boolean {
  return !!a && !!b && a !== b;
}

useAuthStore.subscribe((state, prev) => {
  const switched =
    differs(prev.userId, state.userId) ||
    differs(tokenSubject(prev.accessToken), tokenSubject(state.accessToken));
  const { pending, unconfirmed } = usePendingTapStore.getState();
  if ((pending || unconfirmed) && (signedOut() || switched)) {
    if (pending) spend(tapId(pending));
    usePendingTapStore.setState({ pending: null, unconfirmed: null });
  }
});

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

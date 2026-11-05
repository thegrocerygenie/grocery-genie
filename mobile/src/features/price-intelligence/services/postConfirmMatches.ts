import { router } from 'expo-router';
import type { QueryClient } from '@tanstack/react-query';

import { useMatchPromptStore } from '@/store/matchPromptStore';
import { useRouteStore } from '@/store/routeStore';

import { listReceiptSuggestions } from './itemsApi';

export const receiptSuggestionsKey = (receiptId: string) =>
  ['items', 'suggestions', 'receipt', receiptId] as const;

/** PI-02 AC 7 (the user's choice): at most this many questions after a confirm. */
export const POST_CONFIRM_MAX = 3;

/**
 * PI-02 AC 7 (DA-5): after a confirm has succeeded, ask about the suggestions
 * that receipt's lines raised, in the full-screen "Same item?" prompt: the
 * best 3 by match percent, best first. The rest wait on Review Matches.
 *
 * The confirm request matches the lines inline (in a savepoint that never
 * fails it), so its suggestions exist once it answers; this one fetch reads
 * them. It runs after the confirm, not inside it: the confirm never waits on
 * it, and a failure here only means no prompt.
 *
 * The caller calls this right after its own navigation away from the confirm
 * (one screen change). If the user has moved on to another screen by the time
 * the suggestions load, nothing opens (the user's choice): they wait on
 * Review Matches and item detail. Each suggestion is prompted at most once.
 */
export async function promptMatchesAfterConfirm(
  receiptId: string,
  queryClient: QueryClient,
): Promise<void> {
  // The confirm's own navigation is the one change allowed.
  const allowed = useRouteStore.getState().changes + 1;
  try {
    const suggestions = await queryClient.fetchQuery({
      queryKey: receiptSuggestionsKey(receiptId),
      queryFn: () => listReceiptSuggestions(receiptId),
      staleTime: 0,
    });
    if (useRouteStore.getState().changes > allowed) return;
    const best = [...suggestions]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, POST_CONFIRM_MAX);
    const fresh = useMatchPromptStore.getState().claim(best.map((s) => s.id));
    if (!fresh.length) return;
    router.push({ pathname: '/items/match', params: { receiptId, ids: fresh.join(',') } });
  } catch {
    // No prompt: the suggestions wait on Review Matches and item detail.
  }
}

import { router } from 'expo-router';
import type { QueryClient } from '@tanstack/react-query';

import { useMatchPromptStore } from '@/store/matchPromptStore';

import { listReceiptSuggestions } from './itemsApi';

export const receiptSuggestionsKey = (receiptId: string) =>
  ['items', 'suggestions', 'receipt', receiptId] as const;

/**
 * PI-02 AC 7 (DA-5): after a confirm has succeeded, ask about the suggestions
 * that receipt's lines raised, in the full-screen "Same item?" prompt.
 *
 * The confirm request matches the lines inline (in a savepoint that never
 * fails it), so its suggestions exist once it answers; this one fetch reads
 * them. It runs after the confirm, not inside it: the confirm never waits on
 * it, and a failure here only means no prompt (the suggestions stay on Review
 * Matches and item detail). Each suggestion is prompted at most once.
 */
export async function promptMatchesAfterConfirm(
  receiptId: string,
  queryClient: QueryClient,
): Promise<void> {
  try {
    const suggestions = await queryClient.fetchQuery({
      queryKey: receiptSuggestionsKey(receiptId),
      queryFn: () => listReceiptSuggestions(receiptId),
      staleTime: 0,
    });
    const fresh = useMatchPromptStore.getState().claim(suggestions.map((s) => s.id));
    if (!fresh.length) return;
    router.push({ pathname: '/items/match', params: { receiptId, ids: fresh.join(',') } });
  } catch {
    // No prompt: the suggestions wait on Review Matches and item detail.
  }
}

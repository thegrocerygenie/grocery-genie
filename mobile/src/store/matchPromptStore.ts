import { create } from 'zustand';

/**
 * PI-02 AC 7 (DA-5): the suggestions the post-scan "Same item?" prompt has
 * already shown, so it never shows one twice. A receipt is confirmed once, so
 * a later confirm cannot raise the same suggestion again; this guards the same
 * session (a second Save tap, a retry). Skipped suggestions stay pending on
 * the server and stay on Review Matches and item detail.
 */
interface MatchPromptState {
  prompted: Record<string, true>;
  /** The ids not yet prompted; they are marked prompted. */
  claim: (ids: string[]) => string[];
}

export const useMatchPromptStore = create<MatchPromptState>()((set, get) => ({
  prompted: {},
  claim: (ids) => {
    const fresh = ids.filter((id) => !get().prompted[id]);
    if (fresh.length) {
      set((s) => ({
        prompted: { ...s.prompted, ...Object.fromEntries(fresh.map((id) => [id, true])) },
      }));
    }
    return fresh;
  },
}));

import { create } from 'zustand';

/**
 * How many times the screen (pathname) has changed this session, fed by
 * RouteTracker in the root layout. PI-02 AC 7: the post-confirm "Same item?"
 * prompt opens only while the user is still on the screen the confirm left
 * them on, which it tells by this count.
 */
interface RouteState {
  pathname: string | null;
  changes: number;
  record: (pathname: string) => void;
}

export const useRouteStore = create<RouteState>()((set, get) => ({
  pathname: null,
  changes: 0,
  record: (pathname) => {
    if (pathname !== get().pathname) set((s) => ({ pathname, changes: s.changes + 1 }));
  },
}));

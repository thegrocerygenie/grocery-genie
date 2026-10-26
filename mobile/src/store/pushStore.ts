import { create } from 'zustand';

interface PushState {
  /** The Expo push token registered for this device in this session. */
  token: string | null;
  setToken: (token: string | null) => void;
}

export const usePushStore = create<PushState>()((set) => ({
  token: null,
  setToken: (token) => set({ token }),
}));

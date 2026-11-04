/**
 * scanActivity.ts — JS-side helpers for the Scan Live Activity.
 *
 * Wraps a native module that calls ActivityKit. Two integration paths:
 *
 *   A. expo-live-activity (community) — `npx expo install expo-live-activity`
 *      then use its API. The wrapper below adapts that shape.
 *   B. Custom native module — `expo-modules-core` + a Swift class exposing
 *      start/update/end. The wrapper is the same; swap the import.
 *
 * The data shape MUST match `ScanAttributes` / `ScanState` in
 * ScanLiveActivity.swift exactly — Codable decoding is strict.
 */

import { Platform } from 'react-native';

export type ScanPhase = 'capturing' | 'parsing' | 'parsed' | 'error';

export type ScanState = {
  phase: ScanPhase;
  progress: number;          // 0–1
  itemsParsed: number;
  itemsTotal: number;        // 0 if unknown
  total?: number;
  errorMessage?: string;
};

export type ScanAttributes = {
  store: string;
  startedAt: string;         // ISO date — matches Swift Date Codable
};

// Replace this stub with the real native module:
//   import LiveActivity from 'expo-live-activity';
const LiveActivity: any = {
  isSupported: () => Platform.OS === 'ios',
  start: async (_attrs: ScanAttributes, _state: ScanState): Promise<string> => 'mock-id',
  update: async (_id: string, _state: ScanState) => {},
  end: async (_id: string, _state: ScanState, _dismissAfter = 4) => {},
};

// MARK: - Public API

let activeId: string | null = null;

export async function startScanActivity(store: string): Promise<void> {
  if (!LiveActivity.isSupported()) return;
  activeId = await LiveActivity.start(
    { store, startedAt: new Date().toISOString() },
    { phase: 'capturing', progress: 0.05, itemsParsed: 0, itemsTotal: 0 }
  );
}

export async function updateScanActivity(state: Partial<ScanState>): Promise<void> {
  if (!activeId) return;
  // Read previous state from a small in-memory cache; in production you
  // probably keep this in your store and pass the full state.
  await LiveActivity.update(activeId, normalize(state));
}

export async function finishScanActivity(total: number): Promise<void> {
  if (!activeId) return;
  await LiveActivity.end(activeId, {
    phase: 'parsed',
    progress: 1,
    itemsParsed: 0,
    itemsTotal: 0,
    total,
  });
  activeId = null;
}

export async function failScanActivity(message: string): Promise<void> {
  if (!activeId) return;
  await LiveActivity.end(activeId, {
    phase: 'error',
    progress: 1,
    itemsParsed: 0,
    itemsTotal: 0,
    errorMessage: message,
  });
  activeId = null;
}

// Coerce partial input into the strict shape Swift expects
function normalize(s: Partial<ScanState>): ScanState {
  return {
    phase: s.phase ?? 'parsing',
    progress: s.progress ?? 0,
    itemsParsed: s.itemsParsed ?? 0,
    itemsTotal: s.itemsTotal ?? 0,
    total: s.total,
    errorMessage: s.errorMessage,
  };
}

// MARK: - Wiring example for Scan.tsx
//
// async onShutter() {
//   Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
//   await startScanActivity("Trader Joe's");
//   const photo = await cameraRef.current?.takePictureAsync(...);
//   await updateScanActivity({ phase: 'parsing', progress: 0.4 });
//   const ocr = await runOcr(photo.uri, (parsed, total) =>
//     updateScanActivity({
//       phase: 'parsing',
//       progress: 0.4 + 0.5 * (parsed / total),
//       itemsParsed: parsed,
//       itemsTotal: total,
//     })
//   );
//   await finishScanActivity(ocr.total);
//   router.push({ pathname: '/review', params: { uri: photo.uri } });
// }

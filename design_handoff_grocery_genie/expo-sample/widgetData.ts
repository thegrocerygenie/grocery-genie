/**
 * widgetData.ts — Push the current budget snapshot to the Widget Extension.
 *
 * Strategy: shared App Group → UserDefaults. React Native writes JSON,
 * the Swift WidgetExtension reads the same key and decodes.
 *
 * Requirements (one-time setup):
 *   1. Enable App Groups capability on BOTH the main app target AND the
 *      widget extension target. Use the same group name.
 *   2. Install a UserDefaults bridge with App Group support:
 *        npx expo install @react-native-async-storage/async-storage
 *        OR write a tiny custom Expo Module — recommended.
 *
 * The native side reads from:
 *   UserDefaults(suiteName: "group.com.grocerygenie.shared")
 *     .data(forKey: "budget-snapshot")
 *
 * Call `pushBudgetSnapshot()` whenever a receipt is saved, deleted, or
 * the budget settings change.
 */

import { NativeModules, Platform } from 'react-native';

const APP_GROUP = 'group.com.grocerygenie.shared';
const KEY = 'budget-snapshot';

// Replace with your real shared-defaults bridge.
// One option: react-native-shared-group-preferences
const SharedDefaults: any = NativeModules.SharedGroupPreferences ?? {
  setItem: async (_k: string, _v: string, _g: string) => {},
};

export type BudgetSnapshot = {
  spent: number;
  cap: number;
  monthLabel: string;       // e.g. "April · day 19"
  daysLeft: number;
  categories: Array<{
    name: string;
    symbol: string;          // SF Symbol
    colorHex: string;        // e.g. "34C759"
    spent: number;
    cap: number;
  }>;
};

export async function pushBudgetSnapshot(snap: BudgetSnapshot): Promise<void> {
  if (Platform.OS !== 'ios') return;
  await SharedDefaults.setItem(KEY, JSON.stringify(snap), APP_GROUP);
  // Tell the widget to reload now (otherwise it waits for the timeline).
  reloadAllTimelines();
}

function reloadAllTimelines() {
  // Either via WidgetKitNativeModule from `react-native-widgetkit`, or a
  // tiny Expo Module that calls WidgetCenter.shared.reloadAllTimelines().
  NativeModules.WidgetKit?.reloadAllTimelines?.();
}

// MARK: - Build snapshot from your store

export function buildSnapshotFromBudget(args: {
  spent: number;
  cap: number;
  month: Date;
  categories: Array<{ id: string; name: string; spent: number; cap: number }>;
}): BudgetSnapshot {
  const day = args.month.getDate();
  const monthName = args.month.toLocaleString('en-US', { month: 'long' });
  const lastDay = new Date(args.month.getFullYear(), args.month.getMonth() + 1, 0).getDate();

  const symbolMap: Record<string, { symbol: string; colorHex: string }> = {
    groceries:    { symbol: 'cart.fill',           colorHex: '34C759' },
    household:    { symbol: 'house.fill',          colorHex: '007AFF' },
    personalCare: { symbol: 'heart.fill',          colorHex: 'FF2D55' },
    beverages:    { symbol: 'cup.and.saucer.fill', colorHex: '5856D6' },
    snacks:       { symbol: 'birthday.cake.fill',  colorHex: 'FF9500' },
    babyKids:     { symbol: 'figure.and.child.holdinghands', colorHex: 'FFCC00' },
    pet:          { symbol: 'pawprint.fill',       colorHex: '30B0C7' },
    other:        { symbol: 'tag.fill',            colorHex: '8E8E93' },
  };

  return {
    spent: args.spent,
    cap: args.cap,
    monthLabel: `${monthName} · day ${day}`,
    daysLeft: lastDay - day,
    categories: args.categories
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 4)
      .map((c) => ({
        name: c.name,
        symbol: symbolMap[c.id]?.symbol ?? 'tag.fill',
        colorHex: symbolMap[c.id]?.colorHex ?? '8E8E93',
        spent: c.spent,
        cap: c.cap,
      })),
  };
}

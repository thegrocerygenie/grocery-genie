# Handoff: Grocery Genie — Design System v2 + MVP Screens

## Overview

Grocery Genie is an iOS-first receipt-scanning budget tracker built with Expo + React Native. This handoff contains:

1. **A v2 design system** — Apple-lens revision of an earlier system: SF Pro typography, iOS system colors, materials, Activity-ring-style budget visualization, Live Activity + widget surfaces.
2. **Drop-in Expo / React Native components** for every MVP screen.
3. **Native iOS extensions** (Swift) for the home/lock-screen widgets and the scan-flow Live Activity / Dynamic Island.

## About the Design Files

The HTML files under `reference/` are **design references created in HTML** — interactive prototypes showing intended look and behavior, **not production code to ship**. Open them in a browser to see the full design system and every MVP screen as iPhone artboards on a pan/zoom canvas.

The TypeScript / Swift files under `expo-sample/` are **drop-in implementations** of the same designs, ready to merge into the existing Expo codebase at `mobile/`. Each file's purpose is documented in `expo-sample/README.md` and `expo-sample/native/README.md`.

The task is to integrate these implementation files into the existing `mobile/` Expo Router app and wire them up to real data. The HTML reference is the source of truth for visual fidelity questions.

## Fidelity

**High-fidelity.** All colors, type, spacing, radii, and motion specs are final. Pixel-perfect recreation expected. Tokens are explicit (`tokens-v2.css` + `expo-sample/theme.ts`); no guessing required.

## Target environment

- Expo SDK 52+
- `expo-router` (file-based routing, already used in `mobile/app/`)
- iOS 16.1+ (Live Activities) / iOS 17+ (Dynamic Island for widgets)
- Android: most screens work; SF Symbols + chrome-material blur + Live Activity + widgets are iOS-only and need fallback strategies on Android (notes inline in each file)

## Screens / Views (MVP)

| Route | File | Purpose |
|---|---|---|
| `app/onboarding/index.tsx` | `expo-sample/Onboarding.tsx` (Welcome) | First launch — wordmark + "Get Started" |
| `app/onboarding/budget.tsx` | `expo-sample/Onboarding.tsx` (Budget) | Set first monthly limit |
| `app/onboarding/camera.tsx` | `expo-sample/Onboarding.tsx` (Camera) | Permission prompt |
| `app/(tabs)/_layout.tsx` | `expo-sample/TabsLayout.tsx` | Floating chrome-material tab bar |
| `app/(tabs)/index.tsx` | `expo-sample/Dashboard.tsx` | Budget tab (empty / on-track / over) |
| `app/(tabs)/scan.tsx` | `expo-sample/Scan.tsx` | Camera capture + permission states |
| `app/(tabs)/history.tsx` | `expo-sample/History.tsx` | Receipt list with search + segmented filter |
| `app/review.tsx` | `expo-sample/Review.tsx` | OCR review (modal) |
| `app/budget-settings.tsx` | `expo-sample/BudgetSettings.tsx` | Overall + per-category limits |
| `app/notification-settings.tsx` | `expo-sample/NotificationSettings.tsx` | Alert thresholds + weekly summary |

## Native iOS extensions

| File | Target | Purpose |
|---|---|---|
| `expo-sample/native/GroceryGenieWidgets.swift` | Widget Extension | Home (`small`/`medium`) + Lock (`accessoryRectangular`/`accessoryCircular`) widgets |
| `expo-sample/native/ScanLiveActivity.swift` | Same Widget Extension | Live Activity + Dynamic Island for the scan flow (compact/expanded/minimal) |
| `expo-sample/scanActivity.ts` | Main app | JS-side helpers to start/update/end the Live Activity |
| `expo-sample/widgetData.ts` | Main app | Push budget snapshots to App Group + reload widget timelines |

See `expo-sample/native/README.md` for the full Xcode setup (Widget Extension target, App Groups capability, `NSSupportsLiveActivities`, bundle ID conventions).

## Design Tokens

All tokens live in two places, kept in sync:
- **CSS / HTML reference**: `reference/tokens-v2.css`
- **TS / RN implementation**: `expo-sample/theme.ts`

### Colors (light mode)

| Token | Value | Use |
|---|---|---|
| `iosBg` | `#F2F2F7` | systemGroupedBackground |
| `iosBg2` | `#FFFFFF` | secondarySystemGroupedBackground (cards, lists) |
| `iosFill3` | `rgba(120,120,128,0.12)` | tertiarySystemFill (icon wells, progress tracks) |
| `iosSeparator` | `rgba(60,60,67,0.29)` | List row hairlines |
| `iosLabel` | `#000000` | Primary text |
| `iosLabel2` | `rgba(60,60,67,0.60)` | Secondary text |
| `iosLabel3` | `rgba(60,60,67,0.30)` | Tertiary text / chevrons |
| `tint` | `#1F7A4A` | Brand green — CTAs only |
| `tintPressed` | `#195F3A` | Pressed CTA |
| `tintBg` | `rgba(31,122,74,0.12)` | Tint pill backgrounds |
| `red` | `#FF3B30` | systemRed — destructive, over-budget |
| `orange` | `#FF9500` | systemOrange — warnings, snacks |
| `green` | `#34C759` | systemGreen — groceries category |
| `blue` | `#007AFF` | systemBlue — household |
| `indigo` | `#5856D6` | systemIndigo — beverages |
| `pink` | `#FF2D55` | systemPink — personal care |

Dark-mode overrides exist in `tokens-v2.css` under `[data-theme="dark"]`.

### Categories

Each category maps to one iOS system color so dark mode + accessibility "just work":

| Category | Color | SF Symbol |
|---|---|---|
| Groceries | systemGreen | `cart.fill` |
| Household | systemBlue | `house.fill` |
| Personal care | systemPink | `heart.fill` |
| Beverages | systemIndigo | `cup.and.saucer.fill` |
| Snacks | systemOrange | `birthday.cake.fill` |
| Baby & kids | systemYellow | `figure.and.child.holdinghands` |
| Pet | systemTeal | `pawprint.fill` |
| Other | systemGray | `tag.fill` |

### Typography

SF Pro for all UI; SF Pro Rounded for money (with `tabular-nums`); Instrument Serif for the launch wordmark only — never UI.

Apple Dynamic Type roles in `theme.ts → type`:
`largeTitle, title1, title2, title3, headline, body, callout, subheadline, footnote, caption1, caption2`. Sizes match `UIFont.TextStyle` defaults.

### Spacing

`xs:4 · sm:8 · md:12 · lg:16 · xl:24 · xxl:32`

### Radii

`card:10 · list:10 · sheet:22 · button:12 · cap:9999`

### Motion

iOS spring presets in `theme.ts → springs`:
- `ring` — Activity-ring physics (damping 18, stiffness 90)
- `ui` — generic tap response (damping 22, stiffness 220)
- `interactive` — gestures (damping 26, stiffness 300)

**Haptic-led rule:** haptic fires *before* the visual change, never after. Enforced in `Dashboard.tsx → onScan` and `Scan.tsx → onShutter`.

## Interactions & Behavior

### Scan flow (the one with native deps)

1. User taps Scan tab → `expo-camera` preview with corner brackets
2. Tap shutter → `Haptics.notificationAsync(Success)` → `takePictureAsync()`
3. `startScanActivity()` begins the Live Activity
4. OCR runs (on-device via `react-native-vision-camera` frame processor, OR send `uri` to server)
5. Each item parsed → `updateScanActivity({ phase: 'parsing', progress, itemsParsed, itemsTotal })`
6. Done → `finishScanActivity(total)` → navigate to `/review`
7. On failure → `failScanActivity(message)` → return to capture state with hint pill

Recommended OCR path for v1: **`expo-document-scanner` (community)** wrapping `VNDocumentCameraViewController` — replaces the custom camera UI entirely with Apple's multi-page scanner.

### Dashboard ring

Animates on mount and on every `progress` change via `useSharedValue + withSpring(progress, springs.ring)`. Over-budget state swaps tint → systemRed and shows a banner above the category list.

### History

- `headerSearchBarOptions` on `<Stack.Screen>` — real native UISearchBar, integrates with the iOS large title for free
- `@react-native-segmented-control/segmented-control` for Week/Month/All filter
- Pending-sync rows show the date in `systemOrange`

### Review (modal)

- `presentation: 'modal'` in `Stack.Screen` options
- Items with `confidence < 0.6` get an orange "verify" tag and tapping the price opens an inline `TextInput` with `keyboardType="decimal-pad"` — **no custom numpad**, the system one is better

## State Management

Each screen takes its data via props or `useLocalSearchParams()`. The handoff doesn't prescribe a state library — Zustand, Jotai, or React Query all work. The shape that matters is in:

- `Dashboard.tsx → DashboardData` (empty | on-track | over)
- `Review.tsx → ReviewData` (store, date, total, category, items[])
- `widgetData.ts → BudgetSnapshot` (the canonical write-to-widget shape)

## Required dependencies

```bash
cd mobile
npx expo install \
  expo-symbols \
  expo-haptics \
  expo-camera \
  expo-blur \
  react-native-svg \
  react-native-reanimated
npm i @react-native-segmented-control/segmented-control
```

For Live Activity + widgets:
- One-time Expo prebuild: `npx expo prebuild`
- Then add a Widget Extension target in Xcode and follow `expo-sample/native/README.md`
- App Group: `group.com.grocerygenie.shared`
- Live Activity bridge: either `expo-live-activity` (community) or a small custom Expo Module — both fit the `scanActivity.ts` shape

## Files in this bundle

```
design_handoff_grocery_genie/
├── README.md                                  # this file
├── expo-sample/                               # drop-in implementation
│   ├── README.md                              # screen-by-screen wiring
│   ├── theme.ts
│   ├── BudgetRing.tsx
│   ├── TabsLayout.tsx
│   ├── Dashboard.tsx
│   ├── Scan.tsx
│   ├── History.tsx
│   ├── Review.tsx
│   ├── BudgetSettings.tsx
│   ├── NotificationSettings.tsx
│   ├── Onboarding.tsx
│   ├── scanActivity.ts                        # JS → Live Activity bridge
│   ├── widgetData.ts                          # JS → Widget data bridge
│   └── native/
│       ├── README.md                          # Xcode setup
│       ├── GroceryGenieWidgets.swift
│       └── ScanLiveActivity.swift
└── reference/                                 # HTML design references — DO NOT SHIP
    ├── Grocery Genie Design System v2.html    # full system on a canvas
    ├── Grocery Genie MVP Screens.html         # all MVP screens as iPhone artboards
    ├── tokens-v2.css                          # source-of-truth tokens
    ├── design-canvas.jsx                      # canvas component
    └── components-v2/                         # individual JSX boards
```

Open `reference/Grocery Genie MVP Screens.html` in any browser for the visual source of truth. Open `reference/Grocery Genie Design System v2.html` for the full design-system board (foundations, components, patterns, motion, accessibility).

## What's intentionally not implemented

- **Android-specific styling** beyond default RN — most screens work, but SF Symbols, chrome-material blur, Live Activities, and widgets are iOS-only. Add Material You / Wear OS equivalents in v2.
- **Watch app** — the `accessoryCircular` widget is a Watch surface, but a full watchOS app is a separate target.
- **Push-driven Live Activity updates** — the included flow uses local updates. APNs setup is straightforward when needed.
- **Interactive widgets** (iOS 17+ AppIntents) — would let users tap "Quick add" on a home widget. Out of scope for MVP.
- **Receipt image storage / sync** — `Scan.tsx` passes a local URI; persistence (FileSystem + iCloud / Supabase / etc.) is the developer's call.
- **Auth / accounts** — not in MVP per the codebase.

## Questions or ambiguities

Open `reference/Grocery Genie Design System v2.html` first — it documents every design decision (including a "what got cut and why" ledger). The MVP screens HTML shows every state of every screen.

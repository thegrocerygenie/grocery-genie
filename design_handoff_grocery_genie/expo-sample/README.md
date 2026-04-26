# Grocery Genie — Expo translation

Drop-in samples that translate every MVP screen from `Grocery Genie MVP Screens.html` into React Native using your existing Expo Router setup.

## Files

| File | Maps to | Purpose |
|---|---|---|
| `theme.ts` | `tokens-v2.css` | All design tokens — colors, radii, spacing, type roles, springs |
| `BudgetRing.tsx` | — | Activity-ring progress component (SVG + Reanimated spring) |
| `TabsLayout.tsx` | `app/(tabs)/_layout.tsx` | Floating chrome-material tab bar with haptics |
| `Dashboard.tsx` | `app/(tabs)/index.tsx` | Budget tab — empty / on-track / over states |
| `Scan.tsx` | `app/(tabs)/scan.tsx` | Camera capture with detection brackets, hint pill, permissions |
| `History.tsx` | `app/(tabs)/history.tsx` | Receipts list + UISearchBar header + segmented filter |
| `Review.tsx` | `app/review.tsx` | OCR review modal — inline price edit for low-confidence rows |
| `BudgetSettings.tsx` | `app/budget-settings.tsx` | Overall + per-category limits |
| `NotificationSettings.tsx` | `app/notification-settings.tsx` | 50/80/100% toggles, weekly summary |
| `Onboarding.tsx` | `app/onboarding/*` | Welcome → Set budget → Camera permission |

## Dependencies

```bash
cd mobile
npx expo install \
  expo-symbols expo-haptics expo-camera expo-blur expo-font \
  react-native-svg react-native-reanimated \
  @react-native-segmented-control/segmented-control
```

## Wiring

Move the files into `mobile/components/` (or wherever you keep shared UI). Each file says where it goes in its top comment; the routes below mirror your existing folder structure:

```
app/
├── _layout.tsx              # add a redirect to /onboarding if !onboarded
├── (tabs)/
│   ├── _layout.tsx          # ← TabsLayout
│   ├── index.tsx            # ← <Dashboard data={...} />
│   ├── scan.tsx             # ← <Scan />
│   └── history.tsx          # ← <History />
├── review.tsx               # ← <Review /> (modal)
├── budget-settings.tsx      # ← <BudgetSettings /> (modal)
├── notification-settings.tsx# ← <NotificationSettings />
└── onboarding/
    ├── index.tsx            # ← OnboardingWelcome
    ├── budget.tsx           # ← OnboardingBudget
    └── camera.tsx           # ← OnboardingCamera
```

## Things to know

**SF Symbols.** `expo-symbols` is iOS only. For Android, swap `<SymbolView>` for `<Ionicons>`/`<Feather>` from `@expo/vector-icons` behind a small `<Icon>` wrapper. All symbol names used (`cart.fill`, `camera.viewfinder`, `cup.and.saucer.fill`, `house.fill`, `bell.fill`, `cross.case.fill`, `birthday.cake.fill`, `chevron.right`, `clock.fill`, `magnifyingglass`, `exclamationmark.triangle.fill`) exist in SF Symbols 5+.

**Haptic-before-visual.** Both `Scan.onShutter` and `TabsLayout.onPress` fire haptics *before* the navigation/capture action. Don't reverse — Apple research shows haptic-leading-visual feels measurably faster.

**Modal vs push.** Review and BudgetSettings use `presentation: 'modal'` (transient, confirm-then-save). NotificationSettings is pushed (it's a sub-screen of main Settings). Onboarding screens have `headerShown: false` for fullscreen takeover.

**Wordmark font.** `Onboarding.tsx` uses `'Times New Roman'` as a placeholder for the Instrument Serif wordmark. Load the real font with `expo-font`:

```tsx
import { useFonts } from 'expo-font';
const [loaded] = useFonts({ 'Instrument Serif': require('./assets/InstrumentSerif.ttf') });
```

Then change `fontFamily: 'Times New Roman'` to `'Instrument Serif'` in the wordmark style.

**Search bar.** History uses `headerSearchBarOptions` on `<Stack.Screen>` — this renders a real native UISearchBar on iOS that integrates with the large title and collapses on scroll. Free, native, accessible.

**Document scanner — recommended upgrade.** For v1, swap the custom `Scan.tsx` for `expo-document-scanner` (community) which wraps Apple's `VNDocumentCameraViewController` — same scanner Notes uses. Multi-page, perspective-corrected, edge-detected. ~50 LOC instead of the full custom camera UI. Keep our Scan.tsx as a fallback / Android path.

**Live Activity / Dynamic Island.** Not in this sample. The processing state in Scan would also drive a Live Activity ("Reading receipt at Trader Joe's…" → "$58.42 added") via `expo-live-activity` (community) or a thin native module. Designed in the system already; ship after MVP.

**Widgets.** Same — designed in the system, separate native target. Use `expo-widgets-extension` or write a SwiftUI WidgetExtension and ship via a config plugin.

**Dark mode.** Tokens already include semantic colors. To activate: read `useColorScheme()` and switch `colors.iosBg` etc. through a small theme provider, or use `PlatformColor('label')` everywhere on iOS. Both work; pick one.

## What's intentionally NOT here

- Auth / sign-in (your codebase has none yet)
- Real OCR pipeline (the data shape is defined; the implementation is yours)
- Offline queue / sync logic
- Skeleton loaders, toasts, pull-to-refresh — add as you encounter the need
- Tests

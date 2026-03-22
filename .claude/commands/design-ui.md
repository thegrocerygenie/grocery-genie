---
description: Design and build polished, production-grade mobile UI components for Grocery Genie. Use when creating new screens, components, or refining visual design. Produces React Native code that follows Apple HIG and the app's design system.
---

# Mobile UI Design

Build distinctive, production-grade mobile UI for Grocery Genie. Every screen and component should feel intentionally designed, not like generic template output.

## Design Thinking (before writing any code)

Before coding, answer these questions:

1. **User context**: Which persona uses this screen? What are they doing right before and after? What's their emotional state? (Sarah checking budget = anxious about overspending. Marcus browsing recipes = curious and hungry.)
2. **Core action**: What is the ONE thing the user should do on this screen? Design to make that action effortless and obvious.
3. **Information hierarchy**: What does the user need to see first, second, third? Design the visual weight to match.
4. **Delight opportunity**: What small detail would make this screen memorable? A satisfying animation when a receipt is confirmed? A color shift as budget approaches threshold? A subtle haptic on category tap?

## Design System — Grocery Genie

Apply these consistently across all screens and components:

### Typography
- **Display/Headers**: Use a distinctive, warm sans-serif (SF Pro Display or equivalent through Expo). Bold weights for screen titles.
- **Body**: SF Pro Text (system default on iOS) for readability. 16pt minimum for body text.
- **Numbers/Money**: Use tabular (monospaced) figures for financial data so columns align. Slightly larger weight for totals and budget amounts.
- **Hierarchy**: Title (28pt bold) → Section Header (20pt semibold) → Body (16pt regular) → Caption (13pt regular, secondary color).

### Color Palette
Define in a shared theme file. Use semantic color names, not raw values:
- `colors.primary` — the Grocery Genie brand accent (used sparingly: CTAs, active states)
- `colors.success` — budget under control, fresh ingredients (green family)
- `colors.warning` — budget approaching threshold, items expiring soon (amber family)
- `colors.danger` — budget exceeded, items expired (red family)
- `colors.background` — screen background (light neutral, not pure white)
- `colors.surface` — card/container background (white or near-white)
- `colors.textPrimary` — primary text (near-black, not pure black)
- `colors.textSecondary` — secondary labels, captions (medium gray)
- `colors.border` — subtle dividers and card borders

Support dark mode from the start: define both light and dark palettes in the theme. Use `useColorScheme()` to switch.

### Spacing & Layout
- Base unit: 4pt grid. All spacing is a multiple of 4 (8, 12, 16, 24, 32, 48).
- Screen padding: 16pt horizontal.
- Card padding: 16pt internal.
- Between cards/sections: 16pt.
- Touch targets: minimum 44×44pt (Apple HIG requirement).
- Safe area: always use `SafeAreaView` or Expo's `useSafeAreaInsets()`.

### Components Patterns
- **Cards**: Rounded corners (12pt radius), subtle shadow or border, white surface on light background.
- **Lists**: Use `FlatList` or `SectionList`, never `ScrollView` with mapped children for dynamic data.
- **Loading states**: Skeleton screens (animated placeholder shapes), never bare spinners for content areas.
- **Empty states**: Illustration or icon + clear message + CTA. Never a blank screen.
- **Error states**: Inline error with retry action. Never just a toast for critical failures.

### Motion & Feedback
- **Screen transitions**: Use Expo Router's default native transitions. Don't fight the platform.
- **Confirming actions**: Subtle scale animation (0.95 → 1.0) + haptic feedback on receipt confirm, budget save.
- **Budget threshold**: Animate the progress bar color transition from success → warning → danger as spending increases.
- **Pull to refresh**: Native pull-to-refresh on receipt history and dashboard.
- **Skeleton loading**: Shimmer animation on placeholder content while data loads.
- Use `react-native-reanimated` for complex animations. CSS-style animations don't exist in RN.

### Accessibility (non-negotiable)
- Every interactive element has `accessibilityLabel` describing its purpose, not its appearance.
- Every image has `accessibilityLabel` describing its content.
- Group related elements with `accessibilityRole` and `accessible={true}` on containers.
- Budget progress uses `accessibilityValue` with `{ min, max, now }` for VoiceOver.
- Color is never the sole indicator — always pair with text or icon (e.g., budget danger = red bar + "Over budget" text).
- Test every screen with VoiceOver on iOS simulator before considering it done.

## Screen-Specific Design Guidance

### Receipt Capture Screen
- Camera viewfinder is full-screen with a semi-transparent overlay outside the detected receipt edge.
- Capture button is large (64pt), centered at bottom, with a satisfying press animation.
- Quality warnings (blur, low light) appear as non-intrusive banners at the top, not blocking alerts.
- After capture: smooth transition to review screen with the captured image shrinking into a card.

### Receipt Review Screen
- Receipt image displayed at top (tappable to expand full-screen).
- Extracted data in an editable card list below.
- Low-confidence fields: amber left-border on the card, not an intrusive highlight on every character.
- Confirm button is sticky at the bottom, prominent, disabled until at least store name + 1 item are present.
- Correction flow: tap a field → inline edit with keyboard → tap away to save. No modal.

### Budget Dashboard
- Top card: overall budget progress (large arc or horizontal bar with spend/budget ratio).
- Category breakdown: horizontal bars ranked by spend, each with category color and amount.
- Trend: small sparkline or bar chart for 3-month trend, not a full chart screen.
- The dashboard should feel calm and informative when under budget, and create gentle urgency when approaching threshold.

### Receipt History
- Clean list with store logo/initial, date, total, item count per row.
- Swipe-to-reveal for quick actions (delete, re-review).
- Search bar at top, sticky. Filter chips for date range and store.

## Implementation Rules

- Use `StyleSheet.create` for all styles. Never inline style objects.
- Extract the design system (colors, spacing, typography) into `src/constants/theme.ts`.
- Every screen uses the shared theme — no hardcoded colors or font sizes in components.
- Test on iPhone SE (small screen) and iPhone 15 Pro Max (large screen) to verify layout doesn't break.
- After building any screen, run `/validate-mobile` then test with VoiceOver.

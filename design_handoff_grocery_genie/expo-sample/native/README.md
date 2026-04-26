# Live Activity + Widgets — Native Extension Setup

These are **iOS app extensions**, not React Native components. They live in their own Xcode targets and communicate with the JS side via App Groups + Codable JSON.

## Files

| File | Target | Purpose |
|---|---|---|
| `native/GroceryGenieWidgets.swift` | `GroceryGenieWidgets` (Widget Extension) | Home + Lock Screen widgets |
| `native/ScanLiveActivity.swift` | Same Widget Extension | Live Activity + Dynamic Island for the scan flow |
| `widgetData.ts` | Main app | JS-side helper to push budget snapshots to the widget |
| `scanActivity.ts` | Main app | JS-side helper to start/update/end the Live Activity |

## One-time Xcode setup

Expo prebuild generates the iOS project (`npx expo prebuild`). Then:

1. **Add the Widget Extension target.** In Xcode: `File → New → Target → Widget Extension`. Name it `GroceryGenieWidgets`. Check "Include Live Activity". Replace the auto-generated `.swift` files with the two in `native/`.

2. **Enable App Groups on both targets.** Project settings → Signing & Capabilities → `+ Capability` → App Groups → add `group.com.grocerygenie.shared`. Do this on the main app target *and* the widget extension target.

3. **Add `NSSupportsLiveActivities` to `Info.plist`** of the main app target:
   ```xml
   <key>NSSupportsLiveActivities</key>
   <true/>
   ```

4. **Bundle ID conventions.**
   - Main app: `com.grocerygenie.app`
   - Widget extension: `com.grocerygenie.app.widgets`
   - App group: `group.com.grocerygenie.shared`

## JS-side wiring

### Widget data — push on every save

```ts
import { pushBudgetSnapshot, buildSnapshotFromBudget } from './widgetData';

// After saving a receipt:
await pushBudgetSnapshot(
  buildSnapshotFromBudget({
    spent: 242,
    cap: 400,
    month: new Date(),
    categories: [
      { id: 'groceries', name: 'Groceries', spent: 142, cap: 175 },
      // ...
    ],
  })
);
```

### Live Activity — drive from `Scan.tsx`

```ts
import {
  startScanActivity,
  updateScanActivity,
  finishScanActivity,
  failScanActivity,
} from './scanActivity';

const onShutter = async () => {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  await startScanActivity("Trader Joe's");

  const photo = await cameraRef.current?.takePictureAsync({ quality: 0.8 });
  await updateScanActivity({ phase: 'parsing', progress: 0.4 });

  try {
    const ocr = await runOcr(photo.uri, (parsed, total) =>
      updateScanActivity({
        phase: 'parsing',
        progress: 0.4 + 0.5 * (parsed / total),
        itemsParsed: parsed,
        itemsTotal: total,
      })
    );
    await finishScanActivity(ocr.total);
    router.push({ pathname: '/review', params: { uri: photo.uri } });
  } catch (e: any) {
    await failScanActivity(e.message ?? 'Couldn\'t read receipt');
  }
};
```

The Live Activity stays visible on the Lock Screen and Dynamic Island even after the user backgrounds the app — that's the whole point. When `finishScanActivity()` is called, the system displays the final state for ~4 seconds before dismissing.

## Widget families

| Family | Use | Size |
|---|---|---|
| `.systemSmall` | Home Screen | 158×158 — ring + caption |
| `.systemMedium` | Home Screen | 338×158 — ring + top 3 categories |
| `.accessoryRectangular` | Lock Screen | wide line — ring + remaining + days left |
| `.accessoryCircular` | Lock Screen / Watch | 76×76 — minimal ring + dollars |

The `WidgetEntryView` switches on `@Environment(\.widgetFamily)` so all four share one entry point — Apple's recommended pattern.

## Live Activity layouts

The Dynamic Island has three layouts the system picks between:

- **Compact** (everyday case) — leading SF Symbol + trailing percentage / total. The pulsing `doc.text.viewfinder` icon indicates parsing.
- **Expanded** (long-press or auto-reveal) — store name + phase label + progress bar, plus a "Review receipt" CTA when done.
- **Minimal** (when multiple activities compete) — single phase glyph.

Tap targets use `Link(destination: URL(string: "grocerygenie://review"))` — register that scheme in your `app.json`:

```json
{
  "expo": {
    "scheme": "grocerygenie"
  }
}
```

## Testing tips

- Live Activities **don't run in Expo Go**. Build with `eas build --profile development`.
- The Dynamic Island is iPhone 14 Pro+ only. Older devices show only the Lock Screen banner.
- `WidgetCenter.shared.reloadAllTimelines()` is rate-limited — don't spam it. Once per receipt save is fine.
- Use Xcode's "Simulate Live Activity" debug menu to inspect each phase without running the full scan flow.

## What's intentionally not here

- **Interactive widgets** (iOS 17+ AppIntents) — would let users tap a "Quick add" button on the home widget. Out of scope for v1.
- **Watch app** — the `.accessoryCircular` complication is a Watch surface, but a full WatchOS app is a separate target. Add later.
- **Push-driven Live Activity updates** — server-pushed updates need APNs setup. The flow above uses local updates only, which is sufficient because OCR runs on-device.

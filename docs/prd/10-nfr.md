# Non-Functional Requirements

## Performance
1. Receipt image upload to structured data display: ≤5 seconds on 4G for single-page receipt.
2. Dashboard load: ≤2 seconds on app foreground.
3. Receipt history search: results within 1 second for up to 1,000 receipts.
4. Push notification delivery: within 5 minutes of trigger event.
5. Recipe matching: results within 3 seconds for 100 ingredients against 500+ recipes.

## Scalability
1. 100K MAU at MVP; architecture accommodates 1M+ without fundamental redesign.
2. Receipt pipeline handles burst loads (Sunday evening peaks) via queue-based processing.
3. Multi-tenant data model supports household access without cross-tenant joins.

## Security
1. TLS 1.2+ for all data in transit.
2. All data at rest encrypted.
3. Auth: email/password with complexity rules + social login (Google, Apple).
4. Household invitation tokens: single-use, expire after 7 days.
5. Receipt images and data logically isolated per user/household. No cross-tenant leakage.
6. Community price sharing strips all user-identifying info. Anonymization is irreversible.
7. API rate limiting: 50 receipt submissions/hour, 300 reads/minute per user.

## Privacy
1. Favor on-device/local models where feasible to minimize data exposure.
2. Data export: users can export all data (receipts, budgets, prices) in JSON or CSV.
3. Account deletion: removes all personal data within 30 days. Anonymized community contributions retained.
4. Community price sharing: strictly opt-in with clear consent flow.
5. No receipt data used for ad targeting. No data sold to third parties.

## Reliability & Availability
1. Target uptime: 99.5% (excluding scheduled maintenance).
2. Receipt processing retried automatically up to 3 times with exponential backoff.
3. Offline support: images queued locally, processed when connectivity restored.
4. Data durability: images and extracted data backed up with point-in-time recovery.

## Accessibility
1. WCAG 2.1 AA compliance for all user-facing screens.
2. Screen reader support for receipt review and dashboards.
3. Minimum touch target: 44×44 points.
4. Color contrast: ≥4.5:1 normal text, ≥3:1 large text.
5. Dynamic type / font scaling support (iOS and Android).

## Localization
1. MVP: English (US and CA) primary. UI strings externalized for future translation.
2. Receipt parsing supports multiple languages/locales from MVP (per RC-05).
3. Currency display adapts to user locale. Internal storage uses ISO 4217.
4. Date display adapts to user locale. Internal storage uses ISO 8601.

## Compatibility
1. iOS 16+ (~90% of active iOS devices). Android target deferred — do not build.
2. React Native (Expo managed workflow) with TypeScript strict mode.
3. Optimized for phones. Tablet layout is stretch goal, not MVP.
4. Camera requires device permission via expo-camera. Graceful degradation to photo library if denied.

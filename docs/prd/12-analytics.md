# Analytics & Observability

## Product Analytics Events

All events include: user_id, timestamp, device type, app version.

**Storage [MVP].** The API stores each event in the `analytics_events` table in our own Postgres. The privacy policy says app activity stays with us and our hosting providers, so no third-party analytics service receives it. Rows are kept 13 months (`GG_ANALYTICS_EVENT_RETENTION_DAYS`, default 396), then a daily task deletes them; deleting an account deletes its events. Events are written in a transaction of their own when the request ends, so a request that fails (a rejected scan) still records its events, and a failed write never fails the request.

**Device type and app version** come from the app's `X-Device-Type` (the iOS model ID, such as `iPhone16,2`) and `X-App-Version` headers on every API call. They are null on a request without them.

MVP notes on the table below:
- `receipt_confirmed` also has `source` (`scan` or `manual`). A manual receipt is saved as confirmed, so it records `receipt_confirmed` with `correction_count` 0.
- `budget_alert_triggered.category` is the budget's category ID, or `overall` for the overall budget.
- `receipt_abandoned.stage` `confirmation` means the user tapped Save on review, the save did not succeed, and they left.
- `language_detected` on `receipt_extraction_completed` is not sent yet: the extraction prompt does not return a language.

| Event | Properties | Purpose |
|-------|-----------|---------|
| `receipt_scan_started` | source (camera/library/pdf) | Scan initiation rate and source mix |
| `receipt_extraction_completed` | duration_ms, item_count, confidence_avg, language_detected | Extraction performance and accuracy |
| `receipt_correction_made` | field (name/qty/price/category) | Identify systematic failures for prompt improvement. The original and corrected values are in `receipt_corrections`, not in the event. |
| `receipt_confirmed` | item_count, correction_count | Scan-to-confirmed conversion rate |
| `receipt_abandoned` | stage (capture/review/confirmation), reason (optional) | Drop-off point identification |
| `budget_created` | type (overall/category) | Budget feature adoption |
| `budget_alert_triggered` | threshold_percent, category | Alert frequency |
| `budget_alert_opened` | threshold_percent, notification_source (push/in_app) | Alert engagement rate |
| `price_history_viewed` | canonical_item_id, store_count | Price intelligence engagement |
| `price_alert_triggered` | direction (up/down), percent_change | Price alert frequency (PI-03) |
| `price_alert_muted` | scope (item/store) | Price alert fatigue: how often users mute |
| `price_comparison_viewed` | canonical_item_id, store_count (stores compared) | Cross-store comparison engagement (PI-04) |
| `store_merged` | none | Store normalization misses (EC Price Intelligence 1): how often users merge two stores themselves. Sent by the server on each successful `POST /api/stores/{id}/merge` |
| `store_unmerged` | none | Wrong merges: sent by the server on each `DELETE /api/stores/{id}/merge` |
| `budget_rollover_toggled` | enabled, type (overall/category) | Rollover adoption (V1.1, Premium): sent by the server on each `PUT /api/budgets/{id}/rollover` |
| `premium_status_changed` | is_premium, source (webhook/refresh), event_type (RevenueCat's, webhook only) | Conversion and churn by tier: sent by the server only when a user becomes Premium or stops being Premium |
| `custom_category_changed` | action (created/renamed/deleted), custom_count (after the change) | Custom category adoption (BC-05 AC 3, Premium): how many users make their own, and how many they keep |
| `data_exported` | format (json/csv), receipt_count, line_item_count, budget_count, price_observation_count | Data export use (NFR Privacy 2, Premium): sent by the server when an export is built, not for a refused free user |
| `item_match_resolved` | decision (accepted/rejected), method (fuzzy/semantic), confidence | Item matching precision against user-confirmed matches |
| `recipe_suggestion_viewed` | recipe_id, match_score, had_expiring_ingredient | Recipe relevance |
| `recipe_suggestion_cooked` | recipe_id, ingredients_from_pantry, ingredients_purchased | End-to-end meal planner value |
| `shopping_list_generated` | recipe_count, item_count | Shopping list adoption |
| `household_created` | member_count_initial | Household adoption |

## Operational Metrics

- Receipt processing latency: p50, p95, p99 (target: p95 < 5s)
- Extraction accuracy: % receipts requiring zero corrections
- LLM provider latency and error rate per provider
- Category assignment accuracy: % items with no user category change
- Item matching precision/recall (vs. user-confirmed matches)
- Push notification delivery and open rates
- API endpoint latency and error rates
- Queue depth and processing lag for async receipt processing

## Business Metrics

- MAU and WAU
- Receipts scanned per user per week
- Free-to-paid conversion rate (by trigger: feature gate, trial expiration)
- Monthly churn by tier
- ARPU
- NPS (quarterly survey)

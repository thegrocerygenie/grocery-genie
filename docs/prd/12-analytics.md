# Analytics & Observability

## Product Analytics Events

All events include: user_id, timestamp, device type, app version.

| Event | Properties | Purpose |
|-------|-----------|---------|
| `receipt_scan_started` | source (camera/library/pdf) | Scan initiation rate and source mix |
| `receipt_extraction_completed` | duration_ms, item_count, confidence_avg, language_detected | Extraction performance and accuracy |
| `receipt_correction_made` | field (name/qty/price/category), original_value, corrected_value | Identify systematic failures for prompt improvement |
| `receipt_confirmed` | item_count, total_amount, correction_count | Scan-to-confirmed conversion rate |
| `receipt_abandoned` | stage (capture/review/confirmation), reason (optional) | Drop-off point identification |
| `budget_created` | type (overall/category), amount | Budget feature adoption |
| `budget_alert_triggered` | threshold_percent, category | Alert frequency |
| `budget_alert_opened` | threshold_percent, notification_source (push/in_app) | Alert engagement rate |
| `price_history_viewed` | canonical_item_id, store_count | Price intelligence engagement |
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

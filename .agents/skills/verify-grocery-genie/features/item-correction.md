# Item category correction

A user corrects the category of an item on a receipt (BC-05). The correction applies to that item, to earlier receipts with the same item, and to the same item on future scans.

## Sub-features

- `correct-item` changes one item's category and marks it corrected.
- `correct-mapping` records a mapping keyed on the extracted name.
- `correct-next-scan` gives the same item on the next scan the corrected category.
- `correct-retroactive` updates the same item on earlier receipts.

## How to get to it (user POV)

- Review screen after a scan, tap an item's category, pick another, Confirm.
- History tab, open a receipt, edit an item's category, Save.

## Driving it with gg-verify

Preconditions:

- Debug-mode instance; `$G doctor` shows no `FAIL`.

- **Sign up and pick a category.** Run `$G signup correct` and `cat_id=$($G api GET /api/categories | jq -r '.[] | select(.name != "Groceries") | .id' | head -1)`. Record the category name too.
- **Earlier receipt.** Run `old=$($G scan | jq -r .receipt_id)` and confirm it with `$G api PATCH /api/receipts/$old '{"status":"confirmed"}'`.
- **Correct (`correct-item`).** Run `rid=$($G scan | jq -r .receipt_id)`, then `item=$($G api GET /api/receipts/$rid | jq -r '.items[] | select(.raw_name=="Paper Towels 6pk") | .id')`, then `$G api PATCH /api/receipts/$rid "{\"items\":[{\"id\":\"$item\",\"category_id\":\"$cat_id\"}],\"status\":\"confirmed\"}"`. In the response, that item has `category_id` `$cat_id` and `corrected` `true`.
- **Mapping (`correct-mapping`).** `$G sql "SELECT raw_text_pattern, category_id FROM user_item_mappings"` shows one row for `Paper Towels 6pk` with `$cat_id`.
- **Retroactive (`correct-retroactive`).** `$G api GET /api/receipts/$old | jq '.items[] | select(.raw_name=="Paper Towels 6pk") | .category_id'` is `$cat_id`.
- **Next scan (`correct-next-scan`).** Run `next=$($G scan | jq -r .receipt_id)` and `$G api GET /api/receipts/$next | jq '.items[] | select(.raw_name=="Paper Towels 6pk") | .category_id'`. It is `$cat_id`.

## Gotchas

- The mapping is keyed on the name as extracted, not on a corrected name. Correcting the name and the category in one `PATCH` still keys the mapping on the old name.
- `GET /api/categories` returns the seeded defaults plus the user's own. Pick by name, never by position, and avoid the item's current category so the change is real.

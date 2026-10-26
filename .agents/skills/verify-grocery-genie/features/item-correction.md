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

- **Sign up.** Run `$G signup correct`.
- **Earlier receipt.** Run `old=$($G scan | jq -r .receipt_id)` and confirm it with `$G api PATCH /api/receipts/$old '{"status":"confirmed"}'`.
- **Pick a different category.** Run `rid=$($G scan | jq -r .receipt_id)`, then `read -r item cur < <($G api GET /api/receipts/$rid | jq -r '.items[] | select(.raw_name=="Paper Towels 6pk") | "\(.id) \(.category_id)"')`, then `cat_id=$($G api GET /api/categories | jq -r --arg cur "$cur" '.[] | select(.id != $cur and .name != "Groceries") | .id' | head -1)`. Record the category name too.
- **Correct (`correct-item`).** Run `body=$(jq -nc --arg i "$item" --arg c "$cat_id" '{items:[{id:$i,category_id:$c}],status:"confirmed"}')` and `$G api PATCH /api/receipts/$rid "$body"`. In the response, that item has `category_id` `$cat_id` and `corrected` `true`.
- **Mapping (`correct-mapping`).** `$G sql "SELECT raw_text_pattern, category_id FROM user_item_mappings"` shows one row, `paper towels 6pk` (stored lowercase), with `$cat_id`.
- **Retroactive (`correct-retroactive`).** `$G api GET /api/receipts/$old | jq '.items[] | select(.raw_name=="Paper Towels 6pk") | .category_id'` is `$cat_id`.
- **Next scan (`correct-next-scan`).** Run `next=$($G scan | jq -r .receipt_id)` and `$G api GET /api/receipts/$next | jq '.items[] | select(.raw_name=="Paper Towels 6pk") | .category_id'`. It is `$cat_id`.

## Gotchas

- The mapping is keyed on the name as extracted, not on a corrected name. Correcting the name and the category in one `PATCH` still keys the mapping on the old name.
- `GET /api/categories` returns the seeded defaults plus the user's own. The mock scan already puts `Paper Towels 6pk` in Household, the first category that isn't Groceries. A "correction" to Household changes nothing (`corrected` stays `false`, no mapping row), and the retroactive and next-scan steps then pass for the wrong reason. Always pick a category other than the item's current one, as above.
- Build the PATCH body with `jq -nc`, not by hand. A hand-escaped body nested inside `$(...)` can reach the API mangled (422 `json_invalid`).

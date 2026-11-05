# Custom categories

A Premium user adds up to 10 categories of their own on top of the eight defaults (BC-05 AC 3, V1.1 decision D2), renames them, and uses them like any default: in an item correction (and the mapping it teaches the next scan), in a budget, and in the budget summary and dashboard. A free user gets `403 premium_required`. When Premium lapses the categories stay and can be deleted, but not renamed or added to. Deleting one moves its items to "Other", clears it from item mappings, and removes its budget.

## Sub-features

- `cat-free` a free user's `POST /api/categories` gets `403` with `detail.code` `premium_required` and `feature` `custom_categories`.
- `cat-name` a name that repeats a default (any case) is `409 category_name_taken`, and so is one that matches the user's own under Postgres `lower()` (`İce` after `Ice`); a blank name is `422`.
- `cat-create` a Premium user creates 10: each `201`, `is_default` false, sorted after the defaults in creation order (`sort_order` 101-110).
- `cat-limit` the 11th is `409` with `detail.code` `category_limit_reached` and `limit` 10; `categories` holds 10 rows for the user.
- `cat-rename` a rename is `200`; renaming another to the same name is `409 category_name_taken`.
- `cat-budget` a budget on a custom category is `201`.
- `cat-correct` correcting an item to a custom category sets it with `corrected` true, writes the mapping, and shows the spend under the category's name in `/api/budgets/summary` and `/api/dashboard/spending`.
- `cat-next-scan` the next scan puts the same item in the custom category with confidence 1.0.
- `cat-lapse` after an `EXPIRATION`, rename and create are `403 premium_required`, and the 10 categories still list.
- `cat-delete` a lapsed user's delete is `204`: the item moves to "Other", no `line_items` or `budgets` row points at the category, the mapping loses its category, and the budget is gone from `/api/budgets`.
- `cat-isolation` another user never lists the category, and using its id in a budget or a correction is `400`.
- `cat-account-delete` deleting the account deletes the user's categories.
- `cat-look` (DA-9, BC-05 AC 5, 7) every category lists a `color` and `icon`: the eight defaults their fixed ones (Groceries `green`/`cart` ... Other `gray`/`tag`); a create with none gets `indigo`/`tag`, one with `mint`/`leaf` keeps them; a value outside the allowed sets (`#ff0000`, `trash.fill`, the built-in-only `gray`) is `422` on POST and PATCH, and so is an empty PATCH; a PATCH of `color`/`icon` alone is `200` and keeps the name; the dashboard's `categories[]` carries the look.
- `cat-look-lapse` (AC 8) after an `EXPIRATION` the looks still list unchanged, and a PATCH of `color` is `403 premium_required`.
- `cat-look-isolation` a second Premium user's PATCH of the first user's category colour is `404`, the row keeps its look, and they can make their own with the same name and look.

## How to get to it (user POV)

- Settings, Spending, Categories (DA-9 layout): "Built-in" first, each in its icon square; then "Custom" with "n of 10", the user's categories in round icons, a "New category" row and the footer "Custom categories require Premium.". A free user sees the upgrade prompt ("See Premium" opens the paywall) instead of New category; a lapsed user sees their categories in their colours with a note to renew. Tapping a custom category opens the editor (name, colour, icon); for a lapsed user it shows the upgrade prompt instead of Save. Edit in the navigation bar shows a delete button per custom category (Delete asks first) and makes a tap rename. The category picker on Review and on a receipt lists custom categories after the defaults, and so does Budgets. The paywall lists "Your own categories". These screens are UI and need a Simulator check; this journey proves the API they call.

## Driving it with gg-verify

Preconditions:

- Debug-mode instance; `$G doctor` shows no `FAIL`. Premium comes from a RevenueCat event posted with `$G revenuecat` (see [`premium.md`](./premium.md)); the `ev` builder below is the one from that file.

```bash
$G signup categories
uid=$($G api GET /api/users/me | jq -r .id)
now=$(date +%s000); day=86400000
ev() {  # ev ID TYPE EVENT_AT EXPIRES_AT [APP_USER_ID]
  jq -nc --arg id "$1" --arg t "$2" --argjson at "$3" --argjson exp "$4" --arg u "${5:-$uid}" \
    '{api_version:"1.0",event:{id:$id,type:$t,app_user_id:$u,aliases:[$u],entitlement_ids:["premium"],product_id:"gg_premium_monthly",environment:"SANDBOX",event_timestamp_ms:$at,expiration_at_ms:$exp}}'
}
```

- **Free (`cat-free`).** `$G api POST /api/categories '{"name":"Garden"}' || true` prints `-> 403` and `.detail` `{"code":"premium_required","feature":"custom_categories",...}`.
- **Grant.** `$G revenuecat "$(ev "g-$uid" INITIAL_PURCHASE $now $((now+30*day)))"` prints `{"status":"applied"}`.
- **Names (`cat-name`).** `$G api POST /api/categories '{"name":"groceries"}' || true` prints `-> 409` with `.detail.code` `category_name_taken`. `'{"name":"   "}'` prints `-> 422`. `$G api POST /api/categories '{"name":"Ice"}'` is `201`, then `'{"name":"İce"}' || true` is `409 category_name_taken` (both sides of the check go through SQL `lower()`); delete `Ice` (`204`) before the next step.
- **Ten (`cat-create`).** `for n in $(seq 0 9); do $G api POST /api/categories "{\"name\":\"Custom $n\"}" | jq -c '{name,is_default,sort_order}'; done` prints ten `-> 201`, `sort_order` 101 to 110. `$G api GET /api/categories | jq -c '[.[].name]'` lists the eight defaults, then `Custom 0` to `Custom 9`.
- **Eleventh (`cat-limit`).** `$G api POST /api/categories '{"name":"Custom 10"}' || true` prints `-> 409` with `{"code":"category_limit_reached","limit":10,...}`. `$G sql "SELECT count(*) FROM categories WHERE user_id = '$uid'"` is `10`.
- **Rename (`cat-rename`).** `c0=$($G api GET /api/categories | jq -r '.[] | select(.name=="Custom 0") | .id')`, `c1` the same for `Custom 1`. `$G api PATCH /api/categories/$c0 '{"name":"Paper Goods"}'` is `200` with the new name; `$G api PATCH /api/categories/$c1 '{"name":"Paper Goods"}' || true` is `409 category_name_taken`.
- **Budget (`cat-budget`).** `$G api POST /api/budgets "$(jq -nc --arg c "$c0" '{category_id:$c,amount:10,period_start:"2026-03-01"}')"` is `201`.
- **Correction (`cat-correct`).** `rid=$($G scan | jq -r .receipt_id)`, `item=$($G api GET /api/receipts/$rid | jq -r '.items[] | select(.raw_name=="Paper Towels 6pk") | .id')`, then `$G api PATCH /api/receipts/$rid "$(jq -nc --arg i "$item" --arg c "$c0" '{items:[{id:$i,category_id:$c}],status:"confirmed"}')"`: the item has `category_id` `$c0` and `corrected` `true`. `$G sql "SELECT raw_text_pattern, category_id FROM user_item_mappings WHERE user_id = '$uid'"` is `paper towels 6pk|$c0`. `$G api GET '/api/budgets/summary?period=2026-03'` has a row for `$c0` named `Paper Goods`, budget `10.0`, spent `8.49`; `/api/dashboard/spending?period=2026-03` has `$c0` in `category_changes` with spent `8.49`.
- **Next scan (`cat-next-scan`).** `next=$($G scan | jq -r .receipt_id)`; `Paper Towels 6pk` on it has `category_id` `$c0` and `category_confidence` `1.0`.
- **Lapse (`cat-lapse`).** `$G revenuecat "$(ev "e-$uid" EXPIRATION $((now+1000)) $now)"` is `applied`; `is_premium` is `false`. `$G api PATCH /api/categories/$c0 '{"name":"Nope"}' || true` and `$G api POST /api/categories '{"name":"Nope"}' || true` both print `-> 403 premium_required`. `$G api GET /api/categories | jq '[.[] | select(.is_default==false)] | length'` is still `10`.
- **Delete (`cat-delete`).** `other=$($G api GET /api/categories | jq -r '.[] | select(.name=="Other") | .id')`. `$G api DELETE /api/categories/$c0` is `204`. The item on `$rid` now has `category_id` `$other`. `$G sql "SELECT count(*) FROM line_items WHERE category_id = '$c0'"` and the same on `budgets` are `0`; the mapping row reads `paper towels 6pk|` (no category). `$G api GET /api/budgets` is `[]`.
- **Isolation (`cat-isolation`).** `$G signup categories-b`. `$G api GET /api/categories | jq --arg c "$c1" '[.[] | select(.id==$c)] | length'` is `0`. A budget with `category_id` `$c1` prints `-> 400`. Scan, then a PATCH correcting an item to `$c1` prints `-> 400` (`Unknown category ...`).
- **Account delete (`cat-account-delete`).** As user B: `uidb=$($G api GET /api/users/me | jq -r .id)`, grant with `$G revenuecat "$(ev "gb-$uidb" INITIAL_PURCHASE $now $((now+30*day)) $uidb)"`, `$G api POST /api/categories '{"name":"Garden"}'` (`201`), `$G api DELETE /api/users/me` (`204`). `$G sql "SELECT count(*) FROM categories WHERE user_id = '$uidb'"` is `0`.

### Colour and icon (DA-9)

A fresh user, so the cap and lapse steps above don't interfere: `$G signup looks`, `uid` and `ev` as above.

- **Free.** `$G api POST /api/categories '{"name":"Garden","color":"mint","icon":"leaf"}' || true` is `-> 403 premium_required`. Grant as above.
- **Looks (`cat-look`).** `$G api POST /api/categories '{"name":"Garden"}'` is `201` with `"color":"indigo","icon":"tag"`; `'{"name":"Yard","color":"mint","icon":"leaf"}'` is `201` with those. `'{"name":"Bad","color":"#ff0000"}'` and `'{"name":"Bad","icon":"trash.fill"}'` print `-> 422` (`literal_error` listing the allowed set). With `g` Garden's id: `$G api PATCH /api/categories/$g '{"color":"green","icon":"gift"}'` is `200`, name still `Garden`; `'{}'` and `'{"color":"gray"}'` are `-> 422`. `$G api GET /api/categories | jq -c '[.[] | [.name,.color,.icon]]'` lists the eight defaults with their fixed looks, then `Garden green gift`, `Yard mint leaf`. A budget on Yard (`201`), then `$G api GET '/api/dashboard/spending?period=2026-03' | jq -c '[.categories[] | {name,color,icon}]'` is `[{"name":"Yard","color":"mint","icon":"leaf"}]`. `$G sql "SELECT name, color, icon FROM categories WHERE user_id = '$uid' ORDER BY sort_order"` agrees.
- **Lapse (`cat-look-lapse`).** `EXPIRATION` as above; `$G api PATCH /api/categories/$y '{"color":"red"}' || true` is `-> 403 premium_required`; the list still shows `Garden green gift`, `Yard mint leaf`.
- **Isolation (`cat-look-isolation`).** `$G signup looks-b`, grant B Premium. `$G api PATCH /api/categories/$y '{"color":"red"}' || true` is `-> 404`; B lists no custom categories; B's `POST '{"name":"Yard","color":"mint","icon":"leaf"}'` is `201`. `$G sql "SELECT color, icon FROM categories WHERE id = '$y'"` is still `mint|leaf`.

Proven 2026-11-04, run `20261104-231913` (debug mode).

## Gotchas

- Check names (`cat-name`) before the user reaches 10: at the cap a create is refused as `category_limit_reached` before its name is looked at.
- The mock extractor never assigns a custom category: a custom category reaches a scan only through the user's mapping (`cat-next-scan`). The LLM category prompt lists only the defaults.
- Deleting a category sends no budget alert, though its items now count toward "Other" (and its budget, if any) from the next receipt on.
- Concurrent requests (creates at the cap, a delete racing a budget, correction, manual receipt or scan) are not driven here: they need two transactions held open at once. `backend/tests/api/test_custom_categories_concurrency.py` covers them on Postgres (`make backend-test-pg`).
- Each RevenueCat event id must be new per run; the ids above end in the user's id.
- A free user renaming any category gets `403` before ownership is checked; renaming another user's category as a Premium user is `404` (pytest: `test_another_users_category_cannot_be_renamed_or_deleted`).

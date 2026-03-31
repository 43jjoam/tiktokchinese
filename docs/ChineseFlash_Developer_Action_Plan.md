# ChineseFlash — Developer Action Plan (checklist)

Source: *ChineseFlash_Developer_Action_Plan.docx* (v1.0 · March 2026). Use this file to track implementation order (Section 4).

| Step | Task | Status |
|------|------|--------|
| 1 | Fix activation: verify DB at creation vs redemption; correct order of operations | **Redemption path updated** (`deckService` + `redeem-activation`: load deck → then redeem; row pick + `.is('redeemed_by', null)`). Webhook: allocate codes per order (`shopify-webhook` + `setup_activation_codes_shopify_allocation.sql`). **Manual:** confirm rows in Table Editor (`redeemed_by` null for new codes). |
| 2 | Profile fields: `last_active_date`, `current_streak`, `total_days_active`, `bonus_cards_unlocked` | **Done (app + SQL)** — columns on `user_learning_profiles` (`setup_user_profile_stats_columns.sql`); mirrored in `AppMeta`; upload/merge in `accountSync`; Profile strip. **Manual:** run SQL on Supabase. Streak *increment* = Step 4. |
| 3 | Referral fields: `referral_code`, `referred_by`, `referral_count` | Not started |
| 4 | Streak logic on first card watch of session | Not started |
| 5 | Unlock choice screen after swipe-20 auth (three paths) | Not started |
| 6 | Wire Buy → Bestling / Shopify (activation after Step 1) | Not started |
| 7 | Invite path: `?ref=`, copy link, share | Not started |
| 8 | Referral bonus: +10 `bonus_cards_unlocked` for both users | Not started |
| 9 | Come back tomorrow path + optional reminder email | Not started |
| 10 | Home streak UI (🔥, progress, copy per doc) | Not started |

## Step 1 notes (schema vs doc)

The written spec mentions `redeemed` boolean / `user_decks`; this app uses **`activation_codes.redeemed_by`** (device id) and local deck state. Webhook **selects** pre-seeded codes (does not insert “used” at creation). Fixes applied:

- Redeem **only after** `decks` row exists (**Cause C**).
- Update uses **`.is('redeemed_by', null)`** so the code is not consumed if already taken.
- Prefer an **unredeemed** row when duplicate `code` strings exist.
- Trim-safe comparison for `redeemed_by` vs device id.

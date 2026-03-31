# ChineseFlash — Developer Action Plan (checklist)

Source: *ChineseFlash_Developer_Action_Plan.docx* (v1.0 · March 2026). Use this file to track implementation order (Section 4).

| Step | Task | Status |
|------|------|--------|
| 1 | Fix activation: verify DB at creation vs redemption; correct order of operations | **Redemption path updated** (`deckService` + `redeem-activation`: load deck → then redeem; row pick + `.is('redeemed_by', null)`). Webhook: allocate codes per order (`shopify-webhook` + `setup_activation_codes_shopify_allocation.sql`). **Manual:** confirm rows in Table Editor (`redeemed_by` null for new codes). |
| 2 | Profile fields: `last_active_date`, `current_streak`, `total_days_active`, `bonus_cards_unlocked` | **Done (app + SQL)** — columns on `user_learning_profiles` (`setup_user_profile_stats_columns.sql`); mirrored in `AppMeta`; upload/merge in `accountSync`; Profile strip. **Manual:** run SQL on Supabase. Streak *increment* = Step 4. |
| 3 | Referral fields: `referral_code`, `referred_by`, `referral_count` | **Done (app + SQL)** — `setup_user_profile_referral_columns.sql`; `AppMeta` + sync; client generates `referral_code` on upload (collision retry); `referral_count` server-side only on upsert. **Manual:** run SQL. `?ref=` + bonuses = Steps 7–8. |
| 4 | Streak logic on first card watch of session | **Done (app)** — `applyStreakForFirstWatchOfDay` in `src/lib/streak.ts` (UTC day, consecutive vs gap); runs from `VideoFeed` when the feed becomes playable on the **first card of the session** (`sessionVideoIndex === 0`, `markFeedPlayable`). Updates `lastActiveDate`, `currentStreak`, `totalDaysActive` in `AppMeta` (synced via existing Profile upload). **Manual:** none. Home streak UI = Step 10. |
| 5 | Two gates: (1) guest swipe-20 = email only; (2) signed-in + 20 unique CC1 videos = conversion | **Done (app)** — **Gate 1:** soft nudges at 10/15 swipes, hard email gate at 20 (`SaveProgressModal`, magic link only — no product choices). **Gate 2:** `ConversionUnlockModal` when `countUniqueCc1VideosSeen` ≥ 20 (free Character 1 pool) and user does not own HSK 1: **Pay** (166 videos & characters, Character 1 deck included, shop link), **Invite** (copy `?ref=` link), **Come back tomorrow** / soft dismiss (`conversionUnlockEligibleAfter` next local day). `conversionUnlockDismissedAt` after purchase or invite. **Manual:** none. |
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

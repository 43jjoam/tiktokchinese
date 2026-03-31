/*
  Unused codes must have redeemed_by = NULL (not the literal text "EMPTY", not '').

  Run once in Supabase → SQL for rows that should still be redeemable.
*/

update public.activation_codes
set
  redeemed_by = null,
  redeemed_at = null
where
  redeemed_by is not null
  and (
    btrim(redeemed_by::text) = ''
    or lower(btrim(redeemed_by::text)) = 'empty'
  );

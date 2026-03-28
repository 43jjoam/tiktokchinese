/*
  Row Level Security for browser activation (anon key).

  If activation always fails with vague errors, the anon role is often missing
  SELECT/UPDATE on public.activation_codes or SELECT on public.decks.

  Run in Supabase → SQL → New query. Adjust or drop conflicting policies first.

  Security note: SELECT using (true) on activation_codes lets anyone list rows if
  they can guess UUIDs; codes should be high-entropy. Tighten with an Edge Function
  + service role if you need stricter isolation.
*/

-- Uncomment if RLS is not enabled yet:
-- alter table public.activation_codes enable row level security;
-- alter table public.decks enable row level security;

-- activation_codes: lookup + redeem
drop policy if exists "anon_select_activation_codes" on public.activation_codes;
create policy "anon_select_activation_codes"
  on public.activation_codes
  for select
  to anon
  using (true);

drop policy if exists "anon_update_redeem_activation_codes" on public.activation_codes;
create policy "anon_update_redeem_activation_codes"
  on public.activation_codes
  for update
  to anon
  using (redeemed_by is null)
  with check (true);

-- decks: read metadata for Library / activation success screen
drop policy if exists "anon_select_decks" on public.decks;
create policy "anon_select_decks"
  on public.decks
  for select
  to anon
  using (true);

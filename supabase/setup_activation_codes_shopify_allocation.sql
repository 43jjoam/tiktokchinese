/*
  One activation code per Shopify line item: mark a row as allocated when the webhook emails it,
  so the next order does not reuse the same code before anyone redeems in the app.

  Run once in Supabase → SQL (after public.activation_codes exists).
*/

alter table public.activation_codes
  add column if not exists shopify_allocation_ref text,
  add column if not exists shopify_assigned_at timestamptz;

comment on column public.activation_codes.shopify_allocation_ref is
  'Set when Shopify webhook emails this code (orderId:lineItemId). Idempotent retries + unique per assignment.';

create unique index if not exists activation_codes_shopify_allocation_ref_key
  on public.activation_codes (shopify_allocation_ref)
  where shopify_allocation_ref is not null;

-- New codes must use the same deck UUID as Shopify SKUs map to (see shopify-webhook SKU_TO_DECK),
-- e.g. HSK 1 → 4d0a4205-8770-4c0e-ad4c-90ea8401eea9. Wrong deck_id = "no codes left" for that product.

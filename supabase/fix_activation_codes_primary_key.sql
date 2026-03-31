/*
  If PRIMARY KEY was mistakenly placed on redeemed_by, the Dashboard cannot fix it by toggling the column.
  Move PK to id (uuid), then redeemed_by can be nullable text.

  Run in Supabase → SQL Editor. If any step errors, read the message and adjust (constraint names differ).

  1) See columns and current PK:
     SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'activation_codes';

     SELECT conname, pg_get_constraintdef(oid)
     FROM pg_constraint
     WHERE conrelid = 'public.activation_codes'::regclass AND contype = 'p';
*/

-- Drop existing primary key (name is often activation_codes_pkey)
ALTER TABLE public.activation_codes
  DROP CONSTRAINT IF EXISTS activation_codes_pkey;

-- Ensure each row has an id (only if your table already has an id uuid column — skip otherwise)
-- If id is missing entirely, uncomment:
-- ALTER TABLE public.activation_codes ADD COLUMN id uuid DEFAULT gen_random_uuid();
-- UPDATE public.activation_codes SET id = gen_random_uuid() WHERE id IS NULL;
-- ALTER TABLE public.activation_codes ALTER COLUMN id SET NOT NULL;

-- Primary key on id (required for PostgREST / normal table design)
ALTER TABLE public.activation_codes
  ADD CONSTRAINT activation_codes_pkey PRIMARY KEY (id);

-- Unused codes must allow NULL redeemed_by
ALTER TABLE public.activation_codes
  ALTER COLUMN redeemed_by DROP NOT NULL;

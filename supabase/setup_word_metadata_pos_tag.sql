/*
  Sprint 3: part-of-speech tag on word_metadata (closed set, aligns with PRD §3.3 + src/lib/posTag.ts).

  Apply after setup_gift_v0.sql (word_metadata exists).
  Then re-run: npm run words:metadata-seed-sql and execute the emitted INSERT in SQL editor
  so pos_tag matches app heuristics / overrides.

  If you previously seeded with legacy value `particle`, it is remapped to multi_class before the new CHECK.
*/

ALTER TABLE public.word_metadata
  ADD COLUMN IF NOT EXISTS pos_tag text;

UPDATE public.word_metadata
SET pos_tag = 'noun'
WHERE pos_tag IS NULL;

ALTER TABLE public.word_metadata
  ALTER COLUMN pos_tag SET DEFAULT 'noun';

ALTER TABLE public.word_metadata
  DROP CONSTRAINT IF EXISTS word_metadata_pos_tag_check;

UPDATE public.word_metadata
SET pos_tag = 'multi_class'
WHERE pos_tag = 'particle';

ALTER TABLE public.word_metadata
  ADD CONSTRAINT word_metadata_pos_tag_check CHECK (
    pos_tag IN (
      'noun',
      'verb',
      'adjective',
      'classifier',
      'adverb',
      'conjunction',
      'preposition',
      'pronoun',
      'interjection',
      'multi_class'
    )
  );

ALTER TABLE public.word_metadata
  ALTER COLUMN pos_tag SET NOT NULL;

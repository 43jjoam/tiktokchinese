-- Adds per-user randomised CC1 character_sequence to user_learning_profiles.
-- Run once against the live database.
ALTER TABLE user_learning_profiles
  ADD COLUMN IF NOT EXISTS character_sequence jsonb;

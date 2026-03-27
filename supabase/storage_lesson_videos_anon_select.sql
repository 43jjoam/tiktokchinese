-- Run in Supabase SQL Editor after creating a PRIVATE bucket.
-- Lets the anon key (used by the web app) mint signed URLs for objects in that bucket.
-- Use the exact bucket id from Storage (copy from dashboard; may differ from display name).

-- Example: generic lesson bucket
-- create policy "lesson_videos_anon_select_for_signed_urls"
-- on storage.objects
-- for select
-- to anon
-- using (bucket_id = 'lesson-videos');

-- Chinese Characters 1 deck videos (bucket id: chinese character 1 _videos)
create policy "chinese_characters_1_videos_anon_select_for_signed_urls"
on storage.objects
for select
to anon
using (bucket_id = 'chinese character 1 _videos');

-- Optional: logged-in users too
-- create policy "lesson_videos_authenticated_select_for_signed_urls"
-- on storage.objects
-- for select
-- to authenticated
-- using (bucket_id = 'lesson-videos');

-- The app now stores only profile-picture URLs in Supabase and uploads image files
-- to external image storage. Disable the old public Supabase Storage bucket so
-- legacy profile_picture_url values cannot continue consuming Storage egress.

DROP POLICY IF EXISTS "Anyone can view student profile pictures" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload student profile pictures" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update student profile pictures" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete student profile pictures" ON storage.objects;

UPDATE storage.buckets
SET public = false
WHERE id = 'student-profile-pictures';


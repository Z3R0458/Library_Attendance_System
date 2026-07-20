-- Remove student profile picture storage from the database schema.

ALTER TABLE students
  DROP COLUMN IF EXISTS profile_picture_url;

DROP POLICY IF EXISTS "Anyone can view student profile pictures" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload student profile pictures" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update student profile pictures" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete student profile pictures" ON storage.objects;

DELETE FROM storage.objects
WHERE bucket_id = 'student-profile-pictures';

DELETE FROM storage.buckets
WHERE id = 'student-profile-pictures';

-- Add optional student profile pictures without changing attendance behavior.

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS profile_picture_url TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'student-profile-pictures',
  'student-profile-pictures',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Anyone can view student profile pictures" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload student profile pictures" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update student profile pictures" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete student profile pictures" ON storage.objects;

CREATE POLICY "Anyone can view student profile pictures"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'student-profile-pictures');

CREATE POLICY "Anyone can upload student profile pictures"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'student-profile-pictures');

CREATE POLICY "Admins can update student profile pictures"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'student-profile-pictures')
  WITH CHECK (bucket_id = 'student-profile-pictures');

CREATE POLICY "Admins can delete student profile pictures"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'student-profile-pictures');

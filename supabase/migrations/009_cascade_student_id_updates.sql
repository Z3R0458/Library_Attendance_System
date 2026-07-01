-- Allow admins to correct a student's ID while preserving attendance history.

ALTER TABLE attendance
  DROP CONSTRAINT IF EXISTS attendance_student_id_fkey;

ALTER TABLE attendance
  ADD CONSTRAINT attendance_student_id_fkey
  FOREIGN KEY (student_id)
  REFERENCES students(student_id)
  ON UPDATE CASCADE
  ON DELETE CASCADE;

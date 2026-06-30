-- Prevent duplicate student names after trimming and normalizing spacing/case.
-- If this migration fails, clean existing duplicate names first, then rerun it.

CREATE UNIQUE INDEX IF NOT EXISTS students_name_normalized_unique
  ON students (lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g')));

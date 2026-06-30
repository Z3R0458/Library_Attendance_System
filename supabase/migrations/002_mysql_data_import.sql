-- Optional: Import existing MySQL data into Supabase
-- Run AFTER 001_initial_schema.sql
-- Replace placeholder values with your exported data

-- Example: Import students (generate qr_token for existing records)
-- INSERT INTO students (student_id, name, course, year_level, qr_token, created_at)
-- VALUES
--   ('2021-0001', 'Juan Dela Cruz', 'Computer Science', 3, gen_random_uuid(), now());

-- Example: Import attendance (map status from time_out)
-- INSERT INTO attendance (student_id, date, time_in, time_out, purpose, status, created_at)
-- VALUES
--   ('2021-0001', '2025-01-15', '2025-01-15 08:30:00+08', '2025-01-15 12:00:00+08', 'Study', 'completed', now());

-- To export from an old MySQL database:
-- mysqldump -u root library_attendance students attendance auto_logout_logs > backup.sql
-- Then convert MySQL syntax to PostgreSQL or use a migration script.

-- Regenerate QR tokens for all students without one:
-- UPDATE students SET qr_token = gen_random_uuid() WHERE qr_token IS NULL;

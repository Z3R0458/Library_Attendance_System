-- Allow students to log in multiple times per day, but only after logging out.
-- This replaces the old one-attendance-row-per-student-per-day rule.

ALTER TABLE attendance
  DROP CONSTRAINT IF EXISTS attendance_student_id_date_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_one_active_visit_per_student_day
  ON attendance (student_id, date)
  WHERE time_out IS NULL AND status = 'checked_in';

DROP FUNCTION IF EXISTS process_qr_scan(UUID);
DROP FUNCTION IF EXISTS process_qr_scan(UUID, TEXT);

CREATE OR REPLACE FUNCTION process_qr_scan(p_qr_token UUID, p_scan_action TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student RECORD;
  v_active_attendance RECORD;
  v_today DATE;
  v_now TIMESTAMPTZ;
  v_default_purpose TEXT;
  v_scan_action TEXT;
BEGIN
  v_now := now();
  v_today := (v_now AT TIME ZONE get_setting('library_timezone', 'Asia/Manila'))::DATE;
  v_default_purpose := get_setting('default_purpose', 'Study');

  SELECT * INTO v_student
  FROM students
  WHERE qr_token = p_qr_token AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_qr',
      'message', 'Invalid or unregistered QR code.'
    );
  END IF;

  SELECT * INTO v_active_attendance
  FROM attendance
  WHERE student_id = v_student.student_id
    AND date = v_today
    AND time_out IS NULL
    AND status = 'checked_in'
  ORDER BY time_in DESC
  LIMIT 1;

  IF NULLIF(trim(COALESCE(p_scan_action, '')), '') IS NULL THEN
    v_scan_action := CASE WHEN v_active_attendance IS NULL THEN 'time_in' ELSE 'time_out' END;
  ELSE
    v_scan_action := lower(trim(p_scan_action));
  END IF;

  IF v_scan_action NOT IN ('time_in', 'time_out') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_action',
      'message', 'Choose either Login or Logout before scanning.',
      'student', jsonb_build_object(
        'student_id', v_student.student_id,
        'name', v_student.name,
        'course', v_student.course,
        'year_level', v_student.year_level
      )
    );
  END IF;

  IF v_scan_action = 'time_in' THEN
    IF v_active_attendance IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'already_checked_in',
        'message', format('%s is already logged in. Please log out first before logging in again.', v_student.name),
        'student', jsonb_build_object(
          'student_id', v_student.student_id,
          'name', v_student.name,
          'course', v_student.course,
          'year_level', v_student.year_level
        )
      );
    END IF;

    BEGIN
      INSERT INTO attendance (student_id, date, time_in, purpose, status, last_scan_at)
      VALUES (v_student.student_id, v_today, v_now, v_default_purpose, 'checked_in', v_now)
      RETURNING * INTO v_active_attendance;
    EXCEPTION WHEN unique_violation THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'already_checked_in',
        'message', format('%s is already logged in. Please log out first before logging in again.', v_student.name),
        'student', jsonb_build_object(
          'student_id', v_student.student_id,
          'name', v_student.name,
          'course', v_student.course,
          'year_level', v_student.year_level
        )
      );
    END;

    RETURN jsonb_build_object(
      'success', true,
      'action', 'time_in',
      'message', format('Login recorded for %s at %s', v_student.name, to_char(v_now AT TIME ZONE get_setting('library_timezone', 'Asia/Manila'), 'HH12:MI AM')),
      'student', jsonb_build_object(
        'student_id', v_student.student_id,
        'name', v_student.name,
        'course', v_student.course,
        'year_level', v_student.year_level
      ),
      'attendance', jsonb_build_object(
        'id', v_active_attendance.id,
        'date', v_active_attendance.date,
        'time_in', v_active_attendance.time_in,
        'status', v_active_attendance.status
      )
    );
  END IF;

  IF v_active_attendance IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'missing_time_in',
      'message', format('%s is not currently logged in. They must log in before logging out.', v_student.name),
      'student', jsonb_build_object(
        'student_id', v_student.student_id,
        'name', v_student.name,
        'course', v_student.course,
        'year_level', v_student.year_level
      )
    );
  END IF;

  UPDATE attendance
  SET time_out = v_now,
      status = 'completed',
      last_scan_at = v_now
  WHERE id = v_active_attendance.id
  RETURNING * INTO v_active_attendance;

  RETURN jsonb_build_object(
    'success', true,
    'action', 'time_out',
    'message', format('Logout recorded for %s at %s', v_student.name, to_char(v_now AT TIME ZONE get_setting('library_timezone', 'Asia/Manila'), 'HH12:MI AM')),
    'student', jsonb_build_object(
      'student_id', v_student.student_id,
      'name', v_student.name,
      'course', v_student.course,
      'year_level', v_student.year_level
    ),
    'attendance', jsonb_build_object(
      'id', v_active_attendance.id,
      'date', v_active_attendance.date,
      'time_in', v_active_attendance.time_in,
      'time_out', v_active_attendance.time_out,
      'status', v_active_attendance.status
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION process_qr_scan(UUID, TEXT) TO anon, authenticated;

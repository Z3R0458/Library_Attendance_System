-- Add explicit Time In / Time Out scan actions and approved course values.
-- Run this if your Supabase project already has 001_initial_schema.sql applied.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'students_course_allowed_check'
      AND conrelid = 'public.students'::regclass
  ) THEN
    ALTER TABLE students
      ADD CONSTRAINT students_course_allowed_check
      CHECK (course IN ('BSIT', 'BSHM', 'BSCRIM', 'BSENTREP', 'BPA', 'BEED', 'BECED'))
      NOT VALID;
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS process_qr_scan(UUID);

CREATE OR REPLACE FUNCTION process_qr_scan(p_qr_token UUID, p_scan_action TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student RECORD;
  v_attendance RECORD;
  v_cooldown_seconds INTEGER;
  v_today DATE;
  v_now TIMESTAMPTZ;
  v_default_purpose TEXT;
  v_scan_action TEXT;
BEGIN
  v_now := now();
  v_today := (v_now AT TIME ZONE get_setting('library_timezone', 'Asia/Manila'))::DATE;
  v_cooldown_seconds := get_setting('scan_cooldown_seconds', '30')::INTEGER;
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

  SELECT * INTO v_attendance
  FROM attendance
  WHERE student_id = v_student.student_id AND date = v_today;

  IF v_attendance IS NOT NULL AND v_attendance.last_scan_at IS NOT NULL THEN
    IF EXTRACT(EPOCH FROM (v_now - v_attendance.last_scan_at)) < v_cooldown_seconds THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'duplicate_scan',
        'message', format('Please wait %s seconds before scanning again.', v_cooldown_seconds),
        'student', jsonb_build_object(
          'student_id', v_student.student_id,
          'name', v_student.name,
          'course', v_student.course,
          'year_level', v_student.year_level
        )
      );
    END IF;
  END IF;

  IF NULLIF(trim(COALESCE(p_scan_action, '')), '') IS NULL THEN
    v_scan_action := CASE WHEN v_attendance IS NULL THEN 'time_in' ELSE 'time_out' END;
  ELSE
    v_scan_action := lower(trim(p_scan_action));
  END IF;

  IF v_scan_action NOT IN ('time_in', 'time_out') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_action',
      'message', 'Choose either Time In or Time Out before scanning.',
      'student', jsonb_build_object(
        'student_id', v_student.student_id,
        'name', v_student.name,
        'course', v_student.course,
        'year_level', v_student.year_level
      )
    );
  END IF;

  IF v_scan_action = 'time_in' THEN
    IF v_attendance IS NOT NULL AND v_attendance.time_out IS NULL AND v_attendance.status = 'checked_in' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'already_checked_in',
        'message', format('%s is already timed in today.', v_student.name),
        'student', jsonb_build_object(
          'student_id', v_student.student_id,
          'name', v_student.name,
          'course', v_student.course,
          'year_level', v_student.year_level
        )
      );
    END IF;

    IF v_attendance IS NOT NULL AND (v_attendance.time_out IS NOT NULL OR v_attendance.status = 'completed') THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'already_completed',
        'message', format('%s has already completed attendance for today.', v_student.name),
        'student', jsonb_build_object(
          'student_id', v_student.student_id,
          'name', v_student.name,
          'course', v_student.course,
          'year_level', v_student.year_level
        )
      );
    END IF;

    INSERT INTO attendance (student_id, date, time_in, purpose, status, last_scan_at)
    VALUES (v_student.student_id, v_today, v_now, v_default_purpose, 'checked_in', v_now)
    RETURNING * INTO v_attendance;

    RETURN jsonb_build_object(
      'success', true,
      'action', 'time_in',
      'message', format('Time In recorded for %s at %s', v_student.name, to_char(v_now AT TIME ZONE get_setting('library_timezone', 'Asia/Manila'), 'HH12:MI AM')),
      'student', jsonb_build_object(
        'student_id', v_student.student_id,
        'name', v_student.name,
        'course', v_student.course,
        'year_level', v_student.year_level
      ),
      'attendance', jsonb_build_object(
        'id', v_attendance.id,
        'date', v_attendance.date,
        'time_in', v_attendance.time_in,
        'status', v_attendance.status
      )
    );
  END IF;

  IF v_attendance IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'missing_time_in',
      'message', format('%s has no Time In record for today.', v_student.name),
      'student', jsonb_build_object(
        'student_id', v_student.student_id,
        'name', v_student.name,
        'course', v_student.course,
        'year_level', v_student.year_level
      )
    );
  END IF;

  IF v_attendance.time_out IS NOT NULL OR v_attendance.status = 'completed' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'already_completed',
      'message', format('%s has already checked out for today.', v_student.name),
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
  WHERE id = v_attendance.id
  RETURNING * INTO v_attendance;

  RETURN jsonb_build_object(
    'success', true,
    'action', 'time_out',
    'message', format('Time Out recorded for %s at %s', v_student.name, to_char(v_now AT TIME ZONE get_setting('library_timezone', 'Asia/Manila'), 'HH12:MI AM')),
    'student', jsonb_build_object(
      'student_id', v_student.student_id,
      'name', v_student.name,
      'course', v_student.course,
      'year_level', v_student.year_level
    ),
    'attendance', jsonb_build_object(
      'id', v_attendance.id,
      'date', v_attendance.date,
      'time_in', v_attendance.time_in,
      'time_out', v_attendance.time_out,
      'status', v_attendance.status
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION process_qr_scan(UUID, TEXT) TO anon, authenticated;

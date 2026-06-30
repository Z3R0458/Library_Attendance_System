-- Library Attendance System - Supabase Migration
-- Run this in Supabase SQL Editor or via supabase db push

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  course TEXT NOT NULL CHECK (course IN ('BSIT', 'BSHM', 'BSCRIM', 'BSENTREP', 'BPA', 'BEED', 'BECED')),
  year_level SMALLINT NOT NULL CHECK (year_level BETWEEN 1 AND 4),
  qr_token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  qr_issued_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id TEXT NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  date DATE NOT NULL,
  time_in TIMESTAMPTZ,
  time_out TIMESTAMPTZ,
  purpose TEXT DEFAULT 'Study',
  status TEXT NOT NULL DEFAULT 'checked_in'
    CHECK (status IN ('checked_in', 'checked_out', 'completed')),
  last_scan_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (student_id, date)
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auto_logout_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_time TIMESTAMPTZ DEFAULT now(),
  students_logged_out INTEGER DEFAULT 0,
  details TEXT
);

-- Default settings
INSERT INTO app_settings (key, value) VALUES
  ('scan_cooldown_seconds', '30'),
  ('default_purpose', 'Study'),
  ('library_timezone', 'Asia/Manila')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendance(status);
CREATE INDEX IF NOT EXISTS idx_students_qr_token ON students(qr_token);
CREATE INDEX IF NOT EXISTS idx_students_student_id ON students(student_id);

-- ============================================================
-- HELPER: Get setting value
-- ============================================================

CREATE OR REPLACE FUNCTION get_setting(p_key TEXT, p_default TEXT DEFAULT '')
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (SELECT value FROM app_settings WHERE key = p_key),
    p_default
  );
$$;

-- ============================================================
-- CORE: Process QR Scan
-- ============================================================

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

  -- Look up student by QR token
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

  -- Get today's attendance record
  SELECT * INTO v_attendance
  FROM attendance
  WHERE student_id = v_student.student_id AND date = v_today;

  -- Duplicate scan prevention
  IF v_attendance IS NOT NULL AND v_attendance.last_scan_at IS NOT NULL THEN
    IF EXTRACT(EPOCH FROM (v_now - v_attendance.last_scan_at)) < v_cooldown_seconds THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'duplicate_scan',
        'message', format('Please wait %s seconds before scanning again.', v_cooldown_seconds),
        'student', jsonb_build_object(
          'student_id', v_student.student_id,
          'name', v_student.name
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

-- ============================================================
-- STATS: Dashboard aggregates
-- ============================================================

CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE;
  v_visitors_today INTEGER;
  v_currently_inside INTEGER;
  v_daily JSONB;
  v_weekly JSONB;
  v_monthly JSONB;
BEGIN
  v_today := (now() AT TIME ZONE get_setting('library_timezone', 'Asia/Manila'))::DATE;

  SELECT COUNT(DISTINCT student_id) INTO v_visitors_today
  FROM attendance WHERE date = v_today;

  SELECT COUNT(*) INTO v_currently_inside
  FROM attendance
  WHERE date = v_today AND time_out IS NULL AND status = 'checked_in';

  SELECT COALESCE(jsonb_agg(jsonb_build_object('date', date, 'count', cnt) ORDER BY date), '[]'::jsonb)
  INTO v_daily
  FROM (
    SELECT date, COUNT(DISTINCT student_id) AS cnt
    FROM attendance
    WHERE date >= v_today - INTERVAL '6 days'
    GROUP BY date
  ) d;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('week_start', week_start, 'count', cnt) ORDER BY week_start), '[]'::jsonb)
  INTO v_weekly
  FROM (
    SELECT date_trunc('week', date)::DATE AS week_start, COUNT(DISTINCT student_id) AS cnt
    FROM attendance
    WHERE date >= v_today - INTERVAL '8 weeks'
    GROUP BY date_trunc('week', date)
  ) w;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('month', month_label, 'count', cnt) ORDER BY month_start), '[]'::jsonb)
  INTO v_monthly
  FROM (
    SELECT date_trunc('month', date)::DATE AS month_start,
           to_char(date_trunc('month', date), 'Mon YYYY') AS month_label,
           COUNT(DISTINCT student_id) AS cnt
    FROM attendance
    WHERE date >= v_today - INTERVAL '6 months'
    GROUP BY date_trunc('month', date)
  ) m;

  RETURN jsonb_build_object(
    'visitors_today', v_visitors_today,
    'currently_inside', v_currently_inside,
    'daily', v_daily,
    'weekly', v_weekly,
    'monthly', v_monthly
  );
END;
$$;

-- ============================================================
-- AUTO LOGOUT (for scheduled cron)
-- ============================================================

CREATE OR REPLACE FUNCTION auto_logout_all()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE;
  v_now TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  v_now := now();
  v_today := (v_now AT TIME ZONE get_setting('library_timezone', 'Asia/Manila'))::DATE;

  UPDATE attendance
  SET time_out = v_now, status = 'completed', last_scan_at = v_now
  WHERE date = v_today AND time_out IS NULL AND status = 'checked_in';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO auto_logout_logs (execution_time, students_logged_out, details)
  VALUES (v_now, v_count, format('Auto-logout: %s students logged out', v_count));

  RETURN jsonb_build_object('success', true, 'logged_out', v_count);
END;
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_logout_logs ENABLE ROW LEVEL SECURITY;

-- Public can register (insert students)
CREATE POLICY "Anyone can register students"
  ON students FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Public can read students by student_id (for My QR lookup)
CREATE POLICY "Anyone can read students"
  ON students FOR SELECT
  TO anon, authenticated
  USING (true);

-- Public can read attendance (for transparency - optional, restrict in prod)
CREATE POLICY "Anyone can read attendance"
  ON attendance FOR SELECT
  TO anon, authenticated
  USING (true);

-- Authenticated admins can do everything on students
CREATE POLICY "Admins manage students"
  ON students FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins manage attendance"
  ON attendance FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins read settings"
  ON app_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins manage settings"
  ON app_settings FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins read auto_logout_logs"
  ON auto_logout_logs FOR SELECT
  TO authenticated
  USING (true);

-- Grant execute on RPC functions
GRANT EXECUTE ON FUNCTION process_qr_scan(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_dashboard_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION auto_logout_all() TO authenticated;

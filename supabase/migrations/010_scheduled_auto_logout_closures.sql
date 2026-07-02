-- Automatically log out active students at the library closing times.
-- Philippine time is UTC+8, so 12:00 PM and 5:00 PM are 04:00 and 09:00 UTC.
-- The frontend also calls auto_logout_all() as a fallback while an admin page is open.

CREATE OR REPLACE FUNCTION auto_logout_all()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE;
  v_now TIMESTAMPTZ;
  v_timezone TEXT;
  v_count INTEGER;
  v_local_time TEXT;
BEGIN
  v_now := now();
  v_timezone := get_setting('library_timezone', 'Asia/Manila');
  v_today := (v_now AT TIME ZONE v_timezone)::DATE;
  v_local_time := to_char(v_now AT TIME ZONE v_timezone, 'HH12:MI AM');

  UPDATE attendance
  SET time_out = v_now,
      status = 'completed',
      last_scan_at = v_now
  WHERE date = v_today
    AND time_out IS NULL
    AND status = 'checked_in';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO auto_logout_logs (execution_time, students_logged_out, details)
  VALUES (
    v_now,
    v_count,
    format('Scheduled library closure auto-logout at %s: %s students logged out', v_local_time, v_count)
  );

  RETURN jsonb_build_object(
    'success', true,
    'logged_out', v_count,
    'executed_at', v_now,
    'local_time', v_local_time
  );
END;
$$;

GRANT EXECUTE ON FUNCTION auto_logout_all() TO authenticated;

-- Try to enable pg_cron and schedule the database-side automation.
-- If pg_cron is not available in the project, this migration still succeeds;
-- the frontend fallback will continue to call auto_logout_all() while an admin page is open.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron could not be enabled automatically: %', SQLERRM;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('library_auto_logout_lunch');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    BEGIN
      PERFORM cron.unschedule('library_auto_logout_closing');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    PERFORM cron.schedule(
      'library_auto_logout_lunch',
      '0 4 * * *',
      'SELECT public.auto_logout_all();'
    );

    PERFORM cron.schedule(
      'library_auto_logout_closing',
      '0 9 * * *',
      'SELECT public.auto_logout_all();'
    );
  ELSE
    RAISE NOTICE 'pg_cron is not enabled. Schedule auto_logout_all() at 04:00 and 09:00 UTC, or rely on the frontend fallback.';
  END IF;
END;
$$;

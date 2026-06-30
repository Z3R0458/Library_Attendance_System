-- Allow the public scanner flow to set a visit purpose immediately after Time In.

CREATE OR REPLACE FUNCTION update_attendance_purpose(p_attendance_id UUID, p_purpose TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purpose TEXT;
  v_attendance RECORD;
BEGIN
  v_purpose := NULLIF(trim(COALESCE(p_purpose, '')), '');

  IF v_purpose IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Please choose a purpose for visiting the library.'
    );
  END IF;

  IF v_purpose NOT IN ('Study', 'Research', 'Reading', 'Group Work', 'Other') THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Please choose a valid purpose.'
    );
  END IF;

  UPDATE attendance
  SET purpose = v_purpose
  WHERE id = p_attendance_id
    AND status = 'checked_in'
    AND time_out IS NULL
  RETURNING * INTO v_attendance;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Unable to save purpose for this attendance record.'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'purpose', v_attendance.purpose
  );
END;
$$;

GRANT EXECUTE ON FUNCTION update_attendance_purpose(UUID, TEXT) TO anon, authenticated;

-- Reset aman untuk mengulang pengujian sesi absensi hari berjalan.

BEGIN;
SET LOCAL TIME ZONE 'Asia/Jakarta';

CREATE OR REPLACE FUNCTION reset_attendance_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session attendance_sessions;
BEGIN
  SELECT * INTO v_session
  FROM attendance_sessions
  WHERE id = p_session_id AND attendance_date = CURRENT_DATE;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Hanya sesi absensi hari ini yang dapat direset';
  END IF;

  UPDATE attendance_sessions
  SET status = 'open', started_at = now(), ended_at = NULL
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  UPDATE attendance_records
  SET status = 'absent', check_in_at = NULL, confidence = NULL, method = 'manual', notes = NULL
  WHERE session_id = p_session_id;

  INSERT INTO attendance_records (session_id, student_id, class_id, attendance_date, status, method)
  SELECT v_session.id, student.id, student.class_id, v_session.attendance_date, 'absent', 'manual'
  FROM students student
  WHERE student.class_id IS NOT NULL AND student.status = 'active'
  ON CONFLICT (session_id, student_id) DO NOTHING;

  RETURN to_jsonb(v_session);
END;
$$;

REVOKE EXECUTE ON FUNCTION reset_attendance_session(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reset_attendance_session(uuid) TO app_admin;

NOTIFY pgrst, 'reload schema';
COMMIT;

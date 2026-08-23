-- Pengaturan jam sekolah serta pemisahan absensi masuk dan pulang.

BEGIN;
SET LOCAL TIME ZONE 'Asia/Jakarta';

ALTER TABLE school_settings
  ADD COLUMN IF NOT EXISTS entry_time time NOT NULL DEFAULT '07:00:00',
  ADD COLUMN IF NOT EXISTS exit_time time NOT NULL DEFAULT '15:00:00',
  ADD COLUMN IF NOT EXISTS tolerance_minutes smallint NOT NULL DEFAULT 15
    CHECK (tolerance_minutes BETWEEN 0 AND 180);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'school_settings'::regclass
      AND conname = 'school_settings_time_order_check'
  ) THEN
    ALTER TABLE school_settings
      ADD CONSTRAINT school_settings_time_order_check CHECK (exit_time > entry_time);
  END IF;
END;
$$;

ALTER TABLE school_settings DROP COLUMN IF EXISTS late_after;

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS check_out_at timestamptz,
  ADD COLUMN IF NOT EXISTS check_out_confidence numeric(5,2)
    CHECK (check_out_confidence BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS check_out_method varchar(20)
    CHECK (check_out_method IN ('face', 'manual'));

CREATE OR REPLACE FUNCTION check_in_face(p_session_id uuid, p_student_id uuid, p_distance numeric)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session attendance_sessions;
  v_threshold numeric;
  v_entry_time time;
  v_tolerance_minutes smallint;
  v_record attendance_records;
  v_status text;
  v_class_id uuid;
BEGIN
  SELECT * INTO v_session FROM attendance_sessions WHERE id = p_session_id;
  IF v_session.id IS NULL OR v_session.status <> 'open' THEN
    RAISE EXCEPTION 'Sesi absensi tidak aktif';
  END IF;
  SELECT class_id INTO v_class_id FROM students
  WHERE id = p_student_id AND class_id IS NOT NULL AND status = 'active';
  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'Siswa aktif dengan kelas yang valid tidak ditemukan';
  END IF;

  SELECT * INTO v_record
  FROM attendance_records
  WHERE session_id = p_session_id AND student_id = p_student_id
  FOR UPDATE;
  IF v_record.check_in_at IS NOT NULL THEN
    RETURN to_jsonb(v_record);
  END IF;

  SELECT face_threshold, entry_time, tolerance_minutes
  INTO v_threshold, v_entry_time, v_tolerance_minutes
  FROM school_settings WHERE id = 1;
  IF p_distance > v_threshold THEN
    RAISE EXCEPTION 'Tingkat kecocokan wajah belum memenuhi batas';
  END IF;
  v_status := CASE
    WHEN localtime > v_entry_time + make_interval(mins => v_tolerance_minutes) THEN 'late'
    ELSE 'present'
  END;

  INSERT INTO attendance_records (
    session_id, student_id, class_id, attendance_date, status, check_in_at, confidence, method
  ) VALUES (
    v_session.id, p_student_id, v_class_id, v_session.attendance_date, v_status, now(),
    round(greatest(0, least(100, (1 - p_distance) * 100)), 2), 'face'
  )
  ON CONFLICT (session_id, student_id) DO UPDATE SET
    class_id = EXCLUDED.class_id,
    status = EXCLUDED.status,
    check_in_at = EXCLUDED.check_in_at,
    confidence = EXCLUDED.confidence,
    method = 'face'
  RETURNING * INTO v_record;

  RETURN to_jsonb(v_record);
END;
$$;

CREATE OR REPLACE FUNCTION check_out_face(p_session_id uuid, p_student_id uuid, p_distance numeric)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session attendance_sessions;
  v_threshold numeric;
  v_exit_time time;
  v_tolerance_minutes smallint;
  v_record attendance_records;
  v_earliest_exit time;
BEGIN
  SELECT * INTO v_session FROM attendance_sessions WHERE id = p_session_id;
  IF v_session.id IS NULL OR v_session.status <> 'open' THEN
    RAISE EXCEPTION 'Sesi absensi tidak aktif';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM students
    WHERE id = p_student_id AND class_id IS NOT NULL AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Siswa aktif dengan kelas yang valid tidak ditemukan';
  END IF;

  SELECT face_threshold, exit_time, tolerance_minutes
  INTO v_threshold, v_exit_time, v_tolerance_minutes
  FROM school_settings WHERE id = 1;
  IF p_distance > v_threshold THEN
    RAISE EXCEPTION 'Tingkat kecocokan wajah belum memenuhi batas';
  END IF;

  SELECT * INTO v_record
  FROM attendance_records
  WHERE session_id = p_session_id AND student_id = p_student_id
  FOR UPDATE;
  IF v_record.id IS NULL OR v_record.check_in_at IS NULL OR v_record.status NOT IN ('present', 'late') THEN
    RAISE EXCEPTION 'Siswa belum melakukan absensi masuk';
  END IF;
  IF v_record.check_out_at IS NOT NULL THEN
    RETURN to_jsonb(v_record);
  END IF;

  v_earliest_exit := v_exit_time - make_interval(mins => v_tolerance_minutes);
  IF localtime < v_earliest_exit THEN
    RAISE EXCEPTION 'Absensi pulang baru dapat dilakukan mulai pukul %', to_char(v_earliest_exit, 'HH24:MI');
  END IF;

  UPDATE attendance_records
  SET check_out_at = now(),
      check_out_confidence = round(greatest(0, least(100, (1 - p_distance) * 100)), 2),
      check_out_method = 'face'
  WHERE id = v_record.id
  RETURNING * INTO v_record;

  RETURN to_jsonb(v_record);
END;
$$;

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
  SET status = 'absent', check_in_at = NULL, confidence = NULL, method = 'manual',
      check_out_at = NULL, check_out_confidence = NULL, check_out_method = NULL, notes = NULL
  WHERE session_id = p_session_id;

  INSERT INTO attendance_records (session_id, student_id, class_id, attendance_date, status, method)
  SELECT v_session.id, student.id, student.class_id, v_session.attendance_date, 'absent', 'manual'
  FROM students student
  WHERE student.class_id IS NOT NULL AND student.status = 'active'
  ON CONFLICT (session_id, student_id) DO NOTHING;

  RETURN to_jsonb(v_session);
END;
$$;

-- Lengkapi data demo lampau agar laporan masuk/pulang langsung dapat diuji.
UPDATE attendance_records record
SET check_out_at = ((record.attendance_date + time '14:50') AT TIME ZONE 'Asia/Jakarta')
      + (mod(abs(hashtext(student.nis || record.attendance_date::text)::bigint), 36) || ' minutes')::interval,
    check_out_confidence = CASE WHEN record.method = 'face' THEN record.confidence ELSE NULL END,
    check_out_method = record.method
FROM students student
WHERE student.id = record.student_id
  AND student.nis LIKE 'DMY-%'
  AND record.attendance_date < CURRENT_DATE
  AND record.status IN ('present', 'late')
  AND record.check_in_at IS NOT NULL
  AND record.check_out_at IS NULL;

REVOKE EXECUTE ON FUNCTION check_in_face(uuid, uuid, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION check_out_face(uuid, uuid, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION reset_attendance_session(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_in_face(uuid, uuid, numeric) TO app_admin;
GRANT EXECUTE ON FUNCTION check_out_face(uuid, uuid, numeric) TO app_admin;
GRANT EXECUTE ON FUNCTION reset_attendance_session(uuid) TO app_admin;

NOTIFY pgrst, 'reload schema';
COMMIT;

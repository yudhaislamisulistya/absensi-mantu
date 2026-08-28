-- Skor verifikasi wajah yang terkalibrasi dan absensi wajah guru.

BEGIN;
SET LOCAL TIME ZONE 'Asia/Jakarta';

CREATE OR REPLACE FUNCTION face_match_score(p_distance numeric, p_threshold numeric)
RETURNS numeric
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $$
  SELECT round(greatest(0, least(100, 100 - (30 * p_distance / greatest(p_threshold, 0.001)))), 2);
$$;

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS face_distance numeric(6,4) CHECK (face_distance BETWEEN 0 AND 2),
  ADD COLUMN IF NOT EXISTS check_out_face_distance numeric(6,4) CHECK (check_out_face_distance BETWEEN 0 AND 2);

CREATE TABLE IF NOT EXISTS teacher_face_profiles (
  teacher_id uuid PRIMARY KEY REFERENCES teachers(id) ON DELETE CASCADE,
  descriptors jsonb NOT NULL CHECK (jsonb_typeof(descriptors) = 'array'),
  photo_data text,
  sample_count smallint NOT NULL DEFAULT 1 CHECK (sample_count BETWEEN 1 AND 5),
  registered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE teacher_attendance_records
  ADD COLUMN IF NOT EXISTS confidence numeric(5,2) CHECK (confidence BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS face_distance numeric(6,4) CHECK (face_distance BETWEEN 0 AND 2),
  ADD COLUMN IF NOT EXISTS check_out_confidence numeric(5,2) CHECK (check_out_confidence BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS check_out_face_distance numeric(6,4) CHECK (check_out_face_distance BETWEEN 0 AND 2),
  ADD COLUMN IF NOT EXISTS check_out_method varchar(20);

ALTER TABLE teacher_attendance_records DROP CONSTRAINT IF EXISTS teacher_attendance_records_method_check;
ALTER TABLE teacher_attendance_records DROP CONSTRAINT IF EXISTS teacher_attendance_records_check_out_method_check;
ALTER TABLE teacher_attendance_records
  ADD CONSTRAINT teacher_attendance_records_method_check CHECK (method IN ('face', 'manual')),
  ADD CONSTRAINT teacher_attendance_records_check_out_method_check CHECK (check_out_method IN ('face', 'manual'));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'teacher_face_profiles_touch') THEN
    CREATE TRIGGER teacher_face_profiles_touch
      BEFORE UPDATE ON teacher_face_profiles
      FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  END IF;
END;
$$;

WITH setting AS (SELECT face_threshold FROM school_settings WHERE id = 1)
UPDATE attendance_records record
SET face_distance = round((1 - record.confidence / 100)::numeric, 4),
    confidence = face_match_score(round((1 - record.confidence / 100)::numeric, 4), setting.face_threshold)
FROM setting
WHERE record.method = 'face' AND record.confidence IS NOT NULL AND record.face_distance IS NULL;

WITH setting AS (SELECT face_threshold FROM school_settings WHERE id = 1)
UPDATE attendance_records record
SET check_out_face_distance = round((1 - record.check_out_confidence / 100)::numeric, 4),
    check_out_confidence = face_match_score(round((1 - record.check_out_confidence / 100)::numeric, 4), setting.face_threshold)
FROM setting
WHERE record.check_out_method = 'face' AND record.check_out_confidence IS NOT NULL AND record.check_out_face_distance IS NULL;

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
  IF v_session.id IS NULL OR v_session.status <> 'open' THEN RAISE EXCEPTION 'Sesi absensi tidak aktif'; END IF;
  SELECT class_id INTO v_class_id FROM students
  WHERE id = p_student_id AND class_id IS NOT NULL AND status = 'active';
  IF v_class_id IS NULL THEN RAISE EXCEPTION 'Siswa aktif dengan kelas yang valid tidak ditemukan'; END IF;

  SELECT * INTO v_record FROM attendance_records
  WHERE session_id = p_session_id AND student_id = p_student_id FOR UPDATE;
  IF v_record.check_in_at IS NOT NULL THEN RETURN to_jsonb(v_record); END IF;

  SELECT face_threshold, entry_time, tolerance_minutes
  INTO v_threshold, v_entry_time, v_tolerance_minutes FROM school_settings WHERE id = 1;
  IF p_distance < 0 OR p_distance > v_threshold THEN RAISE EXCEPTION 'Jarak wajah belum memenuhi ambang verifikasi'; END IF;
  v_status := CASE WHEN localtime > v_entry_time + make_interval(mins => v_tolerance_minutes) THEN 'late' ELSE 'present' END;

  INSERT INTO attendance_records (
    session_id, student_id, class_id, attendance_date, status, check_in_at,
    confidence, face_distance, method
  ) VALUES (
    v_session.id, p_student_id, v_class_id, v_session.attendance_date, v_status, now(),
    face_match_score(p_distance, v_threshold), round(p_distance, 4), 'face'
  )
  ON CONFLICT (session_id, student_id) DO UPDATE SET
    class_id = EXCLUDED.class_id, status = EXCLUDED.status, check_in_at = EXCLUDED.check_in_at,
    confidence = EXCLUDED.confidence, face_distance = EXCLUDED.face_distance, method = 'face'
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
  IF v_session.id IS NULL OR v_session.status <> 'open' THEN RAISE EXCEPTION 'Sesi absensi tidak aktif'; END IF;
  IF NOT EXISTS (SELECT 1 FROM students WHERE id = p_student_id AND class_id IS NOT NULL AND status = 'active') THEN
    RAISE EXCEPTION 'Siswa aktif dengan kelas yang valid tidak ditemukan';
  END IF;
  SELECT face_threshold, exit_time, tolerance_minutes
  INTO v_threshold, v_exit_time, v_tolerance_minutes FROM school_settings WHERE id = 1;
  IF p_distance < 0 OR p_distance > v_threshold THEN RAISE EXCEPTION 'Jarak wajah belum memenuhi ambang verifikasi'; END IF;

  SELECT * INTO v_record FROM attendance_records
  WHERE session_id = p_session_id AND student_id = p_student_id FOR UPDATE;
  IF v_record.id IS NULL OR v_record.check_in_at IS NULL OR v_record.status NOT IN ('present', 'late') THEN
    RAISE EXCEPTION 'Siswa belum melakukan absensi masuk';
  END IF;
  IF v_record.check_out_at IS NOT NULL THEN RETURN to_jsonb(v_record); END IF;
  v_earliest_exit := v_exit_time - make_interval(mins => v_tolerance_minutes);
  IF localtime < v_earliest_exit THEN
    RAISE EXCEPTION 'Absensi pulang baru dapat dilakukan mulai pukul %', to_char(v_earliest_exit, 'HH24:MI');
  END IF;

  UPDATE attendance_records
  SET check_out_at = now(), check_out_confidence = face_match_score(p_distance, v_threshold),
      check_out_face_distance = round(p_distance, 4), check_out_method = 'face'
  WHERE id = v_record.id RETURNING * INTO v_record;
  RETURN to_jsonb(v_record);
END;
$$;

CREATE OR REPLACE FUNCTION check_teacher_face(p_teacher_id uuid, p_event text, p_distance numeric)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_record teacher_attendance_records;
  v_threshold numeric;
  v_entry_time time;
  v_exit_time time;
  v_tolerance smallint;
  v_earliest_exit time;
BEGIN
  IF p_event NOT IN ('entry', 'exit') THEN RAISE EXCEPTION 'Jenis absensi guru tidak valid'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM teachers teacher JOIN teacher_face_profiles profile ON profile.teacher_id = teacher.id
    WHERE teacher.id = p_teacher_id AND teacher.status = 'active'
  ) THEN RAISE EXCEPTION 'Profil wajah guru aktif tidak ditemukan'; END IF;
  SELECT face_threshold, entry_time, exit_time, tolerance_minutes
  INTO v_threshold, v_entry_time, v_exit_time, v_tolerance FROM school_settings WHERE id = 1;
  IF p_distance < 0 OR p_distance > v_threshold THEN RAISE EXCEPTION 'Jarak wajah belum memenuhi ambang verifikasi'; END IF;

  INSERT INTO teacher_attendance_records (teacher_id, attendance_date)
  VALUES (p_teacher_id, CURRENT_DATE)
  ON CONFLICT (teacher_id, attendance_date) DO NOTHING;
  SELECT * INTO v_record FROM teacher_attendance_records
  WHERE teacher_id = p_teacher_id AND attendance_date = CURRENT_DATE FOR UPDATE;

  IF p_event = 'entry' THEN
    IF v_record.check_in_at IS NULL THEN
      UPDATE teacher_attendance_records
      SET status = CASE WHEN localtime > v_entry_time + make_interval(mins => v_tolerance) THEN 'late' ELSE 'present' END,
          check_in_at = now(), confidence = face_match_score(p_distance, v_threshold),
          face_distance = round(p_distance, 4), method = 'face'
      WHERE id = v_record.id RETURNING * INTO v_record;
    END IF;
  ELSE
    IF v_record.check_in_at IS NULL THEN RAISE EXCEPTION 'Guru belum melakukan absensi masuk'; END IF;
    IF v_record.check_out_at IS NOT NULL THEN RETURN to_jsonb(v_record); END IF;
    v_earliest_exit := v_exit_time - make_interval(mins => v_tolerance);
    IF localtime < v_earliest_exit THEN
      RAISE EXCEPTION 'Absensi pulang baru dapat dilakukan mulai pukul %', to_char(v_earliest_exit, 'HH24:MI');
    END IF;
    UPDATE teacher_attendance_records
    SET check_out_at = now(), check_out_confidence = face_match_score(p_distance, v_threshold),
        check_out_face_distance = round(p_distance, 4), check_out_method = 'face'
    WHERE id = v_record.id RETURNING * INTO v_record;
  END IF;
  RETURN to_jsonb(v_record);
END;
$$;

CREATE OR REPLACE FUNCTION record_teacher_attendance(p_teacher_id uuid, p_event text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_record teacher_attendance_records;
  v_entry_time time;
  v_exit_time time;
  v_tolerance smallint;
BEGIN
  IF p_event NOT IN ('entry', 'exit') THEN RAISE EXCEPTION 'Jenis absensi guru tidak valid'; END IF;
  IF NOT EXISTS (SELECT 1 FROM teachers WHERE id = p_teacher_id AND status = 'active') THEN RAISE EXCEPTION 'Guru aktif tidak ditemukan'; END IF;
  INSERT INTO teacher_attendance_records (teacher_id, attendance_date) VALUES (p_teacher_id, CURRENT_DATE)
  ON CONFLICT (teacher_id, attendance_date) DO NOTHING;
  SELECT * INTO v_record FROM teacher_attendance_records
  WHERE teacher_id = p_teacher_id AND attendance_date = CURRENT_DATE FOR UPDATE;
  SELECT entry_time, exit_time, tolerance_minutes INTO v_entry_time, v_exit_time, v_tolerance FROM school_settings WHERE id = 1;
  IF p_event = 'entry' THEN
    IF v_record.check_in_at IS NULL THEN
      UPDATE teacher_attendance_records
      SET status = CASE WHEN localtime > v_entry_time + make_interval(mins => v_tolerance) THEN 'late' ELSE 'present' END,
          check_in_at = now(), confidence = NULL, face_distance = NULL, method = 'manual'
      WHERE id = v_record.id RETURNING * INTO v_record;
    END IF;
  ELSE
    IF v_record.check_in_at IS NULL THEN RAISE EXCEPTION 'Guru belum melakukan absensi masuk'; END IF;
    IF localtime < v_exit_time - make_interval(mins => v_tolerance) THEN
      RAISE EXCEPTION 'Absensi pulang baru dapat dilakukan mulai pukul %', to_char(v_exit_time - make_interval(mins => v_tolerance), 'HH24:MI');
    END IF;
    IF v_record.check_out_at IS NULL THEN
      UPDATE teacher_attendance_records
      SET check_out_at = now(), check_out_confidence = NULL,
          check_out_face_distance = NULL, check_out_method = 'manual'
      WHERE id = v_record.id RETURNING * INTO v_record;
    END IF;
  END IF;
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
  SELECT * INTO v_session FROM attendance_sessions
  WHERE id = p_session_id AND attendance_date = CURRENT_DATE;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Hanya sesi absensi hari ini yang dapat direset'; END IF;
  UPDATE attendance_sessions SET status = 'open', started_at = now(), ended_at = NULL
  WHERE id = p_session_id RETURNING * INTO v_session;
  UPDATE attendance_records
  SET status = 'absent', check_in_at = NULL, confidence = NULL, face_distance = NULL, method = 'manual',
      check_out_at = NULL, check_out_confidence = NULL, check_out_face_distance = NULL,
      check_out_method = NULL, notes = NULL
  WHERE session_id = p_session_id;
  INSERT INTO attendance_records (session_id, student_id, class_id, attendance_date, status, method)
  SELECT v_session.id, student.id, student.class_id, v_session.attendance_date, 'absent', 'manual'
  FROM students student WHERE student.class_id IS NOT NULL AND student.status = 'active'
  ON CONFLICT (session_id, student_id) DO NOTHING;
  RETURN to_jsonb(v_session);
END;
$$;

CREATE OR REPLACE FUNCTION get_dashboard_summary()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'students', (SELECT count(*) FROM students WHERE status = 'active'),
    'teachers', (SELECT count(*) FROM teachers WHERE status = 'active'),
    'classes', (SELECT count(*) FROM classes),
    'majors', (SELECT count(*) FROM majors),
    'present_today', (SELECT count(*) FROM attendance_records WHERE attendance_date = CURRENT_DATE AND status IN ('present', 'late')),
    'absent_today', (SELECT count(*) FROM attendance_records WHERE attendance_date = CURRENT_DATE AND status = 'absent'),
    'sessions_today', (SELECT count(*) FROM attendance_sessions WHERE attendance_date = CURRENT_DATE),
    'face_registered', (SELECT count(*) FROM face_profiles),
    'teacher_face_registered', (SELECT count(*) FROM teacher_face_profiles)
  );
$$;

REVOKE ALL ON teacher_face_profiles FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION face_match_score(numeric, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION check_teacher_face(uuid, text, numeric) FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON teacher_face_profiles TO app_admin;
GRANT EXECUTE ON FUNCTION check_teacher_face(uuid, text, numeric) TO app_admin;
GRANT EXECUTE ON FUNCTION face_match_score(numeric, numeric) TO app_admin;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Absensi masuk dan pulang guru yang mengikuti pengaturan waktu sekolah.

BEGIN;
SET LOCAL TIME ZONE 'Asia/Jakarta';

CREATE TABLE IF NOT EXISTS teacher_attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  attendance_date date NOT NULL DEFAULT CURRENT_DATE,
  status varchar(20) NOT NULL DEFAULT 'absent' CHECK (status IN ('present', 'late', 'absent')),
  check_in_at timestamptz,
  check_out_at timestamptz,
  method varchar(20) NOT NULL DEFAULT 'manual' CHECK (method = 'manual'),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS teacher_attendance_date_idx
  ON teacher_attendance_records(attendance_date);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'teacher_attendance_records_touch') THEN
    CREATE TRIGGER teacher_attendance_records_touch
      BEFORE UPDATE ON teacher_attendance_records
      FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION prepare_teacher_attendance()
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO teacher_attendance_records (teacher_id, attendance_date)
  SELECT teacher.id, CURRENT_DATE
  FROM teachers teacher
  WHERE teacher.status = 'active'
  ON CONFLICT (teacher_id, attendance_date) DO NOTHING;

  SELECT count(*) INTO v_count
  FROM teacher_attendance_records
  WHERE attendance_date = CURRENT_DATE;
  RETURN jsonb_build_object('attendance_date', CURRENT_DATE, 'count', v_count);
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
  IF p_event NOT IN ('entry', 'exit') THEN
    RAISE EXCEPTION 'Jenis absensi guru tidak valid';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM teachers WHERE id = p_teacher_id AND status = 'active') THEN
    RAISE EXCEPTION 'Guru aktif tidak ditemukan';
  END IF;

  INSERT INTO teacher_attendance_records (teacher_id, attendance_date)
  VALUES (p_teacher_id, CURRENT_DATE)
  ON CONFLICT (teacher_id, attendance_date) DO NOTHING;

  SELECT * INTO v_record
  FROM teacher_attendance_records
  WHERE teacher_id = p_teacher_id AND attendance_date = CURRENT_DATE
  FOR UPDATE;
  SELECT entry_time, exit_time, tolerance_minutes
  INTO v_entry_time, v_exit_time, v_tolerance
  FROM school_settings WHERE id = 1;

  IF p_event = 'entry' THEN
    IF v_record.check_in_at IS NULL THEN
      UPDATE teacher_attendance_records
      SET status = CASE WHEN localtime > v_entry_time + make_interval(mins => v_tolerance) THEN 'late' ELSE 'present' END,
          check_in_at = now(), method = 'manual'
      WHERE id = v_record.id
      RETURNING * INTO v_record;
    END IF;
  ELSE
    IF v_record.check_in_at IS NULL THEN
      RAISE EXCEPTION 'Guru belum melakukan absensi masuk';
    END IF;
    IF localtime < v_exit_time - make_interval(mins => v_tolerance) THEN
      RAISE EXCEPTION 'Absensi pulang baru dapat dilakukan mulai pukul %',
        to_char(v_exit_time - make_interval(mins => v_tolerance), 'HH24:MI');
    END IF;
    IF v_record.check_out_at IS NULL THEN
      UPDATE teacher_attendance_records SET check_out_at = now()
      WHERE id = v_record.id
      RETURNING * INTO v_record;
    END IF;
  END IF;
  RETURN to_jsonb(v_record);
END;
$$;

CREATE OR REPLACE FUNCTION reset_teacher_attendance()
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM teacher_attendance_records WHERE attendance_date = CURRENT_DATE;
  RETURN prepare_teacher_attendance();
END;
$$;

REVOKE ALL ON teacher_attendance_records FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION prepare_teacher_attendance() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION record_teacher_attendance(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION reset_teacher_attendance() FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON teacher_attendance_records TO app_admin;
GRANT EXECUTE ON FUNCTION prepare_teacher_attendance() TO app_admin;
GRANT EXECUTE ON FUNCTION record_teacher_attendance(uuid, text) TO app_admin;
GRANT EXECUTE ON FUNCTION reset_teacher_attendance() TO app_admin;

NOTIFY pgrst, 'reload schema';
COMMIT;

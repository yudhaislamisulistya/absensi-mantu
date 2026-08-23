-- Migrasi absensi per kelas menjadi satu sesi absensi sekolah per hari.
-- Riwayat kelas tetap tersimpan pada attendance_records.class_id sebagai snapshot.

BEGIN;
SET LOCAL TIME ZONE 'Asia/Jakarta';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'attendance_sessions'
      AND column_name = 'class_id'
  ) THEN
    CREATE TEMP TABLE attendance_session_merge ON COMMIT DROP AS
    SELECT
      attendance_date,
      (array_agg(id ORDER BY started_at, id))[1] AS canonical_id,
      min(started_at) AS first_started_at,
      max(ended_at) AS last_ended_at,
      bool_or(status = 'open') AS has_open_session
    FROM attendance_sessions
    GROUP BY attendance_date;

    -- Satu siswa mungkin pernah berpindah kelas pada hari yang sama. Constraint
    -- dilepas sementara agar semua catatan dapat diarahkan ke sesi harian yang sama.
    ALTER TABLE attendance_records
      DROP CONSTRAINT IF EXISTS attendance_records_session_id_student_id_key;

    UPDATE attendance_records record
    SET session_id = merge.canonical_id
    FROM attendance_sessions old_session
    JOIN attendance_session_merge merge
      ON merge.attendance_date = old_session.attendance_date
    WHERE record.session_id = old_session.id
      AND record.session_id <> merge.canonical_id;

    DELETE FROM attendance_records
    WHERE id IN (
      SELECT id
      FROM (
        SELECT
          id,
          row_number() OVER (
            PARTITION BY session_id, student_id
            ORDER BY
              CASE status WHEN 'present' THEN 1 WHEN 'late' THEN 2 ELSE 3 END,
              check_in_at NULLS LAST,
              created_at,
              id
          ) AS duplicate_number
        FROM attendance_records
      ) ranked
      WHERE duplicate_number > 1
    );

    ALTER TABLE attendance_records
      ADD CONSTRAINT attendance_records_session_id_student_id_key UNIQUE (session_id, student_id);

    UPDATE attendance_sessions session
    SET
      started_at = merge.first_started_at,
      ended_at = CASE WHEN merge.has_open_session THEN NULL ELSE merge.last_ended_at END,
      status = CASE WHEN merge.has_open_session THEN 'open' ELSE 'closed' END
    FROM attendance_session_merge merge
    WHERE session.id = merge.canonical_id;

    DELETE FROM attendance_sessions session
    USING attendance_session_merge merge
    WHERE session.attendance_date = merge.attendance_date
      AND session.id <> merge.canonical_id;

    ALTER TABLE attendance_sessions DROP COLUMN class_id;
    ALTER TABLE attendance_sessions
      ADD CONSTRAINT attendance_sessions_attendance_date_key UNIQUE (attendance_date);
  END IF;
END;
$$;

-- Sakit dan izin disederhanakan menjadi tidak hadir sesuai alur absensi sekolah.
UPDATE attendance_records
SET status = 'absent'
WHERE status IN ('sick', 'excused');

ALTER TABLE attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_status_check;
ALTER TABLE attendance_records
  ADD CONSTRAINT attendance_records_status_check
  CHECK (status IN ('present', 'late', 'absent'));

DROP FUNCTION IF EXISTS start_attendance_session(uuid);

CREATE OR REPLACE FUNCTION start_attendance_session()
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session attendance_sessions;
  v_user_id uuid := nullif((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'), '')::uuid;
BEGIN
  INSERT INTO attendance_sessions (created_by)
  VALUES (v_user_id)
  ON CONFLICT (attendance_date)
  DO UPDATE SET status = CASE WHEN attendance_sessions.status = 'closed' THEN 'closed' ELSE 'open' END
  RETURNING * INTO v_session;

  INSERT INTO attendance_records (session_id, student_id, class_id, attendance_date, status, method)
  SELECT v_session.id, student.id, student.class_id, v_session.attendance_date, 'absent', 'manual'
  FROM students student
  WHERE student.class_id IS NOT NULL AND student.status = 'active'
  ON CONFLICT (session_id, student_id) DO NOTHING;

  RETURN to_jsonb(v_session);
END;
$$;

CREATE OR REPLACE FUNCTION check_in_face(p_session_id uuid, p_student_id uuid, p_distance numeric)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session attendance_sessions;
  v_threshold numeric;
  v_late_after time;
  v_record attendance_records;
  v_status text;
  v_class_id uuid;
BEGIN
  SELECT * INTO v_session FROM attendance_sessions WHERE id = p_session_id;
  IF v_session.id IS NULL OR v_session.status <> 'open' THEN
    RAISE EXCEPTION 'Sesi absensi sekolah tidak aktif';
  END IF;

  SELECT class_id INTO v_class_id FROM students
  WHERE id = p_student_id AND class_id IS NOT NULL AND status = 'active';
  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'Siswa aktif dengan kelas yang valid tidak ditemukan';
  END IF;

  SELECT face_threshold, late_after INTO v_threshold, v_late_after
  FROM school_settings WHERE id = 1;
  IF p_distance > v_threshold THEN
    RAISE EXCEPTION 'Tingkat kecocokan wajah belum memenuhi batas';
  END IF;
  v_status := CASE WHEN localtime > v_late_after THEN 'late' ELSE 'present' END;

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

REVOKE EXECUTE ON FUNCTION start_attendance_session() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION check_in_face(uuid, uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION start_attendance_session(), check_in_face(uuid, uuid, numeric) TO app_admin;

NOTIFY pgrst, 'reload schema';
COMMIT;

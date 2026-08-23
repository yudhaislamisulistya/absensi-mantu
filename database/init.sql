CREATE EXTENSION IF NOT EXISTS pgcrypto;

SET TIME ZONE 'Asia/Jakarta';

DO $$ BEGIN
  CREATE ROLE web_anon NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE ROLE app_admin NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE CHECK (username ~ '^[a-zA-Z0-9._-]{3,50}$'),
  password_hash text NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL DEFAULT 'admin' CHECK (role = 'admin'),
  is_active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE majors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(20) NOT NULL UNIQUE,
  name varchar(120) NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nip varchar(40) NOT NULL UNIQUE,
  name varchar(150) NOT NULL,
  gender varchar(1) NOT NULL CHECK (gender IN ('L', 'P')),
  phone varchar(30),
  email varchar(150),
  address text,
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(80) NOT NULL UNIQUE,
  grade smallint NOT NULL CHECK (grade BETWEEN 1 AND 12),
  major_id uuid REFERENCES majors(id) ON DELETE SET NULL,
  homeroom_teacher_id uuid REFERENCES teachers(id) ON DELETE SET NULL,
  academic_year varchar(20) NOT NULL,
  room varchar(50),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nis varchar(40) NOT NULL UNIQUE,
  nisn varchar(40) UNIQUE,
  name varchar(150) NOT NULL,
  gender varchar(1) NOT NULL CHECK (gender IN ('L', 'P')),
  birth_place varchar(100),
  birth_date date,
  address text,
  phone varchar(30),
  parent_phone varchar(30),
  class_id uuid REFERENCES classes(id) ON DELETE SET NULL,
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'graduated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE face_profiles (
  student_id uuid PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  descriptors jsonb NOT NULL CHECK (jsonb_typeof(descriptors) = 'array'),
  photo_data text,
  sample_count smallint NOT NULL DEFAULT 1 CHECK (sample_count BETWEEN 1 AND 5),
  registered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE school_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  school_name varchar(150) NOT NULL DEFAULT 'SMA Mantu',
  late_after time NOT NULL DEFAULT '07:30:00',
  face_threshold numeric(4,3) NOT NULL DEFAULT 0.500 CHECK (face_threshold BETWEEN 0.300 AND 0.650),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE attendance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
  attendance_date date NOT NULL DEFAULT CURRENT_DATE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  status varchar(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, attendance_date)
);

CREATE TABLE attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
  attendance_date date NOT NULL DEFAULT CURRENT_DATE,
  status varchar(20) NOT NULL DEFAULT 'absent' CHECK (status IN ('present', 'late', 'sick', 'excused', 'absent')),
  check_in_at timestamptz,
  confidence numeric(5,2) CHECK (confidence BETWEEN 0 AND 100),
  method varchar(20) NOT NULL DEFAULT 'manual' CHECK (method IN ('face', 'manual')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, student_id)
);

CREATE INDEX students_class_idx ON students(class_id);
CREATE INDEX classes_major_idx ON classes(major_id);
CREATE INDEX attendance_records_date_idx ON attendance_records(attendance_date);
CREATE INDEX attendance_records_student_date_idx ON attendance_records(student_id, attendance_date);
CREATE INDEX attendance_records_class_date_idx ON attendance_records(class_id, attendance_date);

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER app_users_touch BEFORE UPDATE ON app_users FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER majors_touch BEFORE UPDATE ON majors FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER teachers_touch BEFORE UPDATE ON teachers FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER classes_touch BEFORE UPDATE ON classes FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER students_touch BEFORE UPDATE ON students FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER face_profiles_touch BEFORE UPDATE ON face_profiles FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER school_settings_touch BEFORE UPDATE ON school_settings FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER attendance_records_touch BEFORE UPDATE ON attendance_records FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE OR REPLACE FUNCTION base64url(p_data bytea)
RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $$
  SELECT rtrim(replace(translate(encode(p_data, 'base64'), '+/', '-_'), E'\n', ''), '=');
$$;

CREATE OR REPLACE FUNCTION make_jwt(p_user app_users)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_header text := base64url(convert_to('{"alg":"HS256","typ":"JWT"}', 'utf8'));
  v_payload text;
  v_unsigned text;
  v_secret text := current_setting('app.jwt_secret', true);
BEGIN
  IF coalesce(length(v_secret), 0) < 32 THEN
    RAISE EXCEPTION 'JWT secret belum dikonfigurasi';
  END IF;

  v_payload := base64url(convert_to(jsonb_build_object(
    'role', 'app_admin',
    'sub', p_user.id,
    'username', p_user.username,
    'name', p_user.full_name,
    'iat', floor(extract(epoch FROM now()))::bigint,
    'exp', floor(extract(epoch FROM now() + interval '8 hours'))::bigint
  )::text, 'utf8'));
  v_unsigned := v_header || '.' || v_payload;
  RETURN v_unsigned || '.' || base64url(hmac(v_unsigned, v_secret, 'sha256'));
END;
$$;

CREATE OR REPLACE FUNCTION login(p_username text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user app_users;
BEGIN
  SELECT * INTO v_user
  FROM app_users
  WHERE lower(username) = lower(trim(p_username)) AND is_active;

  IF v_user.id IS NULL OR v_user.password_hash <> crypt(p_password, v_user.password_hash) THEN
    RAISE EXCEPTION 'Username atau password salah' USING ERRCODE = '28000';
  END IF;

  UPDATE app_users SET last_login_at = now() WHERE id = v_user.id;
  RETURN jsonb_build_object(
    'token', make_jwt(v_user),
    'user', jsonb_build_object('id', v_user.id, 'username', v_user.username, 'name', v_user.full_name, 'role', v_user.role)
  );
END;
$$;

CREATE OR REPLACE FUNCTION change_password(p_current_password text, p_new_password text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := nullif((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'), '')::uuid;
  v_hash text;
BEGIN
  IF length(p_new_password) < 8 THEN
    RAISE EXCEPTION 'Password baru minimal 8 karakter';
  END IF;
  SELECT password_hash INTO v_hash FROM app_users WHERE id = v_user_id AND is_active;
  IF v_hash IS NULL OR v_hash <> crypt(p_current_password, v_hash) THEN
    RAISE EXCEPTION 'Password saat ini salah' USING ERRCODE = '28000';
  END IF;
  UPDATE app_users SET password_hash = crypt(p_new_password, gen_salt('bf', 10)) WHERE id = v_user_id;
  RETURN jsonb_build_object('success', true);
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
    'face_registered', (SELECT count(*) FROM face_profiles)
  );
$$;

CREATE OR REPLACE FUNCTION start_attendance_session(p_class_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session attendance_sessions;
  v_user_id uuid := nullif((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'), '')::uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM classes WHERE id = p_class_id) THEN
    RAISE EXCEPTION 'Kelas tidak ditemukan';
  END IF;

  INSERT INTO attendance_sessions (class_id, created_by)
  VALUES (p_class_id, v_user_id)
  ON CONFLICT (class_id, attendance_date)
  DO UPDATE SET status = CASE WHEN attendance_sessions.status = 'closed' THEN 'closed' ELSE 'open' END
  RETURNING * INTO v_session;

  INSERT INTO attendance_records (session_id, student_id, class_id, attendance_date, status, method)
  SELECT v_session.id, s.id, p_class_id, v_session.attendance_date, 'absent', 'manual'
  FROM students s
  WHERE s.class_id = p_class_id AND s.status = 'active'
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
BEGIN
  SELECT * INTO v_session FROM attendance_sessions WHERE id = p_session_id;
  IF v_session.id IS NULL OR v_session.status <> 'open' THEN
    RAISE EXCEPTION 'Sesi absensi tidak aktif';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM students WHERE id = p_student_id AND class_id = v_session.class_id AND status = 'active') THEN
    RAISE EXCEPTION 'Siswa tidak terdaftar di kelas ini';
  END IF;

  SELECT face_threshold, late_after INTO v_threshold, v_late_after FROM school_settings WHERE id = 1;
  IF p_distance > v_threshold THEN
    RAISE EXCEPTION 'Tingkat kecocokan wajah belum memenuhi batas';
  END IF;
  v_status := CASE WHEN localtime > v_late_after THEN 'late' ELSE 'present' END;

  UPDATE attendance_records
  SET status = v_status,
      check_in_at = now(),
      confidence = round(greatest(0, least(100, (1 - p_distance) * 100)), 2),
      method = 'face'
  WHERE session_id = p_session_id AND student_id = p_student_id
  RETURNING * INTO v_record;

  RETURN to_jsonb(v_record);
END;
$$;

CREATE OR REPLACE FUNCTION close_attendance_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session attendance_sessions;
BEGIN
  UPDATE attendance_sessions SET status = 'closed', ended_at = now()
  WHERE id = p_session_id AND status = 'open'
  RETURNING * INTO v_session;
  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Sesi aktif tidak ditemukan';
  END IF;
  RETURN to_jsonb(v_session);
END;
$$;

INSERT INTO school_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
INSERT INTO app_users (username, password_hash, full_name)
VALUES ('admin', crypt('123456789', gen_salt('bf', 10)), 'Administrator')
ON CONFLICT (username) DO NOTHING;

REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO web_anon, app_admin;
GRANT EXECUTE ON FUNCTION login(text, text) TO web_anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON majors, teachers, classes, students, face_profiles,
  attendance_sessions, attendance_records TO app_admin;
GRANT SELECT, UPDATE ON school_settings TO app_admin;
GRANT EXECUTE ON FUNCTION change_password(text, text), get_dashboard_summary(),
  start_attendance_session(uuid), check_in_face(uuid, uuid, numeric), close_attendance_session(uuid) TO app_admin;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

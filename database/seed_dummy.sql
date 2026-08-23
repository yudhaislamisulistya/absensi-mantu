-- Dataset demonstrasi Absensi Mantu.
-- Aman dijalankan ulang: seluruh insert memakai natural key + ON CONFLICT.
-- Profil wajah berisi descriptor sintetis untuk demo UI, bukan biometrik siswa nyata.

BEGIN;
SET LOCAL TIME ZONE 'Asia/Jakarta';

INSERT INTO majors (code, name, description) VALUES
  ('RPL',  'Rekayasa Perangkat Lunak',       '[DUMMY] Pengembangan perangkat lunak, web, dan aplikasi mobile.'),
  ('TKJ',  'Teknik Komputer dan Jaringan',   '[DUMMY] Infrastruktur komputer, jaringan, dan layanan server.'),
  ('AKL',  'Akuntansi dan Keuangan Lembaga', '[DUMMY] Akuntansi, perpajakan, dan administrasi keuangan.'),
  ('MPLB', 'Manajemen Perkantoran',          '[DUMMY] Administrasi perkantoran dan layanan bisnis.')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

INSERT INTO teachers (nip, name, gender, phone, email, address, status) VALUES
  ('DMY-2001', 'Drs. Hendra Wijaya',    'L', '081210010001', 'hendra.wijaya@example.sch.id',    'Jl. Melati No. 11, Bandung', 'active'),
  ('DMY-2002', 'Siti Rahmawati, S.Pd.', 'P', '081210010002', 'siti.rahmawati@example.sch.id',   'Jl. Anggrek No. 24, Bandung', 'active'),
  ('DMY-2003', 'Rudi Hartono, S.Kom.',   'L', '081210010003', 'rudi.hartono@example.sch.id',     'Jl. Mawar No. 8, Bandung', 'active'),
  ('DMY-2004', 'Dewi Lestari, S.Pd.',    'P', '081210010004', 'dewi.lestari@example.sch.id',     'Jl. Kenanga No. 17, Bandung', 'active'),
  ('DMY-2005', 'Ahmad Fauzi, M.Kom.',    'L', '081210010005', 'ahmad.fauzi@example.sch.id',      'Jl. Cendana No. 5, Bandung', 'active'),
  ('DMY-2006', 'Nur Aisyah, S.E.',       'P', '081210010006', 'nur.aisyah@example.sch.id',       'Jl. Flamboyan No. 30, Bandung', 'active'),
  ('DMY-2007', 'Bambang Setiawan, S.T.', 'L', '081210010007', 'bambang.setiawan@example.sch.id', 'Jl. Dahlia No. 6, Bandung', 'active'),
  ('DMY-2008', 'Rina Marlina, S.Pd.',    'P', '081210010008', 'rina.marlina@example.sch.id',     'Jl. Teratai No. 21, Bandung', 'active'),
  ('DMY-2009', 'Agus Prabowo, S.Kom.',   'L', '081210010009', 'agus.prabowo@example.sch.id',     'Jl. Sawo No. 14, Bandung', 'active'),
  ('DMY-2010', 'Fitri Handayani, S.E.',  'P', '081210010010', 'fitri.handayani@example.sch.id',  'Jl. Merpati No. 3, Bandung', 'active'),
  ('DMY-2011', 'Dedi Kurniawan, S.Pd.',  'L', '081210010011', 'dedi.kurniawan@example.sch.id',   'Jl. Nusa Indah No. 19, Bandung', 'active'),
  ('DMY-2012', 'Maya Puspitasari, S.Pd.','P', '081210010012', 'maya.puspitasari@example.sch.id', 'Jl. Cemara No. 10, Bandung', 'active')
ON CONFLICT (nip) DO UPDATE SET
  name = EXCLUDED.name,
  gender = EXCLUDED.gender,
  phone = EXCLUDED.phone,
  email = EXCLUDED.email,
  address = EXCLUDED.address,
  status = EXCLUDED.status;

WITH class_seed(name, grade, major_code, teacher_nip, room) AS (VALUES
  ('X RPL 1',   10, 'RPL',  'DMY-2001', 'Lab RPL 1'),
  ('XI RPL 1',  11, 'RPL',  'DMY-2002', 'Lab RPL 2'),
  ('X TKJ 1',   10, 'TKJ',  'DMY-2003', 'Lab Jaringan 1'),
  ('XI TKJ 1',  11, 'TKJ',  'DMY-2004', 'Lab Jaringan 2'),
  ('X AKL 1',   10, 'AKL',  'DMY-2005', 'Ruang 201'),
  ('XI AKL 1',  11, 'AKL',  'DMY-2006', 'Ruang 202'),
  ('X MPLB 1',  10, 'MPLB', 'DMY-2007', 'Ruang 301'),
  ('XI MPLB 1', 11, 'MPLB', 'DMY-2008', 'Ruang 302')
), school_year AS (
  SELECT CASE
    WHEN extract(month FROM CURRENT_DATE) >= 7
      THEN extract(year FROM CURRENT_DATE)::int || '/' || (extract(year FROM CURRENT_DATE)::int + 1)
    ELSE (extract(year FROM CURRENT_DATE)::int - 1) || '/' || extract(year FROM CURRENT_DATE)::int
  END AS value
)
INSERT INTO classes (name, grade, major_id, homeroom_teacher_id, academic_year, room)
SELECT cs.name, cs.grade, m.id, t.id, sy.value, cs.room
FROM class_seed cs
JOIN majors m ON m.code = cs.major_code
JOIN teachers t ON t.nip = cs.teacher_nip
CROSS JOIN school_year sy
ON CONFLICT (name) DO UPDATE SET
  grade = EXCLUDED.grade,
  major_id = EXCLUDED.major_id,
  homeroom_teacher_id = EXCLUDED.homeroom_teacher_id,
  academic_year = EXCLUDED.academic_year,
  room = EXCLUDED.room;

WITH first_names(first_name, gender, sort_order) AS (VALUES
  ('Aditya', 'L', 1), ('Alya',   'P', 2), ('Bima',   'L', 3), ('Citra', 'P', 4),
  ('Daffa',  'L', 5), ('Dinda',  'P', 6), ('Farhan', 'L', 7), ('Kayla', 'P', 8),
  ('Fikri',  'L', 9), ('Nabila', 'P',10), ('Galang', 'L',11), ('Putri', 'P',12),
  ('Ilham',  'L',13), ('Rani',   'P',14), ('Rizky',  'L',15), ('Zahra', 'P',16)
), last_names(last_name, sort_order) AS (VALUES
  ('Pratama', 1), ('Saputra', 2), ('Ramadhan', 3), ('Lestari', 4)
), people AS (
  SELECT row_number() OVER (ORDER BY ln.sort_order, fn.sort_order)::int AS number,
         fn.first_name || ' ' || ln.last_name AS full_name,
         fn.gender
  FROM last_names ln CROSS JOIN first_names fn
), class_map(position, class_name) AS (VALUES
  (1, 'X RPL 1'), (2, 'XI RPL 1'), (3, 'X TKJ 1'), (4, 'XI TKJ 1'),
  (5, 'X AKL 1'), (6, 'XI AKL 1'), (7, 'X MPLB 1'), (8, 'XI MPLB 1')
)
INSERT INTO students (
  nis, nisn, name, gender, birth_place, birth_date, address,
  phone, parent_phone, class_id, status
)
SELECT
  'DMY-2026-' || lpad(p.number::text, 3, '0'),
  '990026' || lpad(p.number::text, 4, '0'),
  p.full_name,
  p.gender,
  (ARRAY['Bandung','Cimahi','Sumedang','Garut','Tasikmalaya'])[(p.number % 5) + 1],
  make_date(extract(year FROM CURRENT_DATE)::int - c.grade - 6, (p.number % 12) + 1, (p.number % 27) + 1),
  'Jl. Pendidikan No. ' || p.number || ', Bandung',
  '0813' || lpad(p.number::text, 8, '0'),
  '0821' || lpad((5000 + p.number)::text, 8, '0'),
  c.id,
  'active'
FROM people p
JOIN class_map cm ON cm.position = ((p.number - 1) / 8) + 1
JOIN classes c ON c.name = cm.class_name
ON CONFLICT (nis) DO UPDATE SET
  nisn = EXCLUDED.nisn,
  name = EXCLUDED.name,
  gender = EXCLUDED.gender,
  birth_place = EXCLUDED.birth_place,
  birth_date = EXCLUDED.birth_date,
  address = EXCLUDED.address,
  phone = EXCLUDED.phone,
  parent_phone = EXCLUDED.parent_phone,
  class_id = EXCLUDED.class_id,
  status = EXCLUDED.status;

WITH face_students AS (
  SELECT s.*,
         row_number() OVER (ORDER BY s.nis)::int AS seed,
         upper(left(s.name, 1) || left(split_part(s.name, ' ', 2), 1)) AS initials
  FROM students s
  WHERE s.nis LIKE 'DMY-%' AND right(s.nis, 3)::int % 4 <> 0
)
INSERT INTO face_profiles (student_id, descriptors, photo_data, sample_count, registered_at)
SELECT
  fs.id,
  jsonb_build_array(
    (SELECT jsonb_agg(round((sin((n + fs.seed) * 0.17) * 0.12)::numeric, 6) ORDER BY n) FROM generate_series(1, 128) n),
    (SELECT jsonb_agg(round((sin((n + fs.seed) * 0.19 + 0.03) * 0.12)::numeric, 6) ORDER BY n) FROM generate_series(1, 128) n),
    (SELECT jsonb_agg(round((sin((n + fs.seed) * 0.21 - 0.03) * 0.12)::numeric, 6) ORDER BY n) FROM generate_series(1, 128) n)
  ),
  'data:image/svg+xml;base64,' || replace(encode(convert_to(format(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><rect width="320" height="320" fill="%s"/><circle cx="160" cy="128" r="66" fill="white" fill-opacity=".22"/><text x="160" y="185" text-anchor="middle" font-family="Arial" font-size="82" font-weight="700" fill="white">%s</text><text x="160" y="280" text-anchor="middle" font-family="Arial" font-size="20" fill="white" fill-opacity=".75">DATA DUMMY</text></svg>',
    CASE WHEN fs.gender = 'L' THEN '#3a71b9' ELSE '#8b5aaa' END,
    fs.initials
  ), 'UTF8'), 'base64'), E'\n', ''),
  3,
  now() - ((fs.seed % 18) || ' days')::interval
FROM face_students fs
ON CONFLICT (student_id) DO UPDATE SET
  descriptors = EXCLUDED.descriptors,
  photo_data = EXCLUDED.photo_data,
  sample_count = EXCLUDED.sample_count,
  registered_at = EXCLUDED.registered_at;

WITH semester AS (
  SELECT make_date(
    extract(year FROM CURRENT_DATE)::int,
    CASE WHEN extract(month FROM CURRENT_DATE) <= 6 THEN 1 ELSE 7 END,
    1
  ) AS start_date
), school_days AS (
  SELECT day::date AS attendance_date
  FROM semester, generate_series(start_date, CURRENT_DATE - 1, interval '1 day') day
  WHERE extract(isodow FROM day) BETWEEN 1 AND 5
), seed_classes AS (
  SELECT c.* FROM classes c
  WHERE EXISTS (SELECT 1 FROM students s WHERE s.class_id = c.id AND s.nis LIKE 'DMY-%')
), admin AS (
  SELECT id FROM app_users WHERE username = 'admin'
)
INSERT INTO attendance_sessions (
  class_id, attendance_date, started_at, ended_at, status, created_by
)
SELECT
  c.id,
  d.attendance_date,
  (d.attendance_date + time '06:55') AT TIME ZONE 'Asia/Jakarta',
  (d.attendance_date + time '08:00') AT TIME ZONE 'Asia/Jakarta',
  'closed',
  a.id
FROM seed_classes c CROSS JOIN school_days d CROSS JOIN admin a
ON CONFLICT (class_id, attendance_date) DO UPDATE SET
  started_at = EXCLUDED.started_at,
  ended_at = EXCLUDED.ended_at,
  status = EXCLUDED.status,
  created_by = EXCLUDED.created_by;

WITH seed_rows AS (
  SELECT sess.id AS session_id, sess.class_id, sess.attendance_date, sess.started_at,
         s.id AS student_id,
         mod(abs(hashtext(s.nis || sess.attendance_date::text)::bigint), 100)::int AS bucket,
         fp.student_id IS NOT NULL AS has_face
  FROM attendance_sessions sess
  JOIN students s ON s.class_id = sess.class_id AND s.nis LIKE 'DMY-%'
  LEFT JOIN face_profiles fp ON fp.student_id = s.id
  WHERE sess.attendance_date < CURRENT_DATE
), valued AS (
  SELECT *, CASE
    WHEN bucket < 78 THEN 'present'
    WHEN bucket < 86 THEN 'late'
    WHEN bucket < 91 THEN 'sick'
    WHEN bucket < 96 THEN 'excused'
    ELSE 'absent'
  END AS attendance_status
  FROM seed_rows
)
INSERT INTO attendance_records (
  session_id, student_id, class_id, attendance_date, status,
  check_in_at, confidence, method, notes
)
SELECT
  session_id,
  student_id,
  class_id,
  attendance_date,
  attendance_status,
  CASE attendance_status
    WHEN 'present' THEN started_at + ((5 + bucket % 20) || ' minutes')::interval
    WHEN 'late' THEN started_at + ((40 + bucket % 25) || ' minutes')::interval
    ELSE NULL
  END,
  CASE WHEN attendance_status IN ('present', 'late') AND has_face AND bucket % 10 < 8
    THEN round((91 + bucket % 8 + 0.25)::numeric, 2)
    ELSE NULL
  END,
  CASE WHEN attendance_status IN ('present', 'late') AND has_face AND bucket % 10 < 8
    THEN 'face'
    ELSE 'manual'
  END,
  CASE attendance_status
    WHEN 'sick' THEN 'Data dummy: surat keterangan sakit'
    WHEN 'excused' THEN 'Data dummy: izin keluarga'
    WHEN 'absent' THEN 'Data dummy: tanpa keterangan'
    ELSE NULL
  END
FROM valued
ON CONFLICT (session_id, student_id) DO UPDATE SET
  status = EXCLUDED.status,
  check_in_at = EXCLUDED.check_in_at,
  confidence = EXCLUDED.confidence,
  method = EXCLUDED.method,
  notes = EXCLUDED.notes;

WITH selected_class AS (
  SELECT id FROM classes WHERE name = 'X RPL 1'
), admin AS (
  SELECT id FROM app_users WHERE username = 'admin'
)
INSERT INTO attendance_sessions (
  class_id, attendance_date, started_at, status, created_by
)
SELECT
  sc.id,
  CURRENT_DATE,
  (CURRENT_DATE + time '07:00') AT TIME ZONE 'Asia/Jakarta',
  'open',
  a.id
FROM selected_class sc CROSS JOIN admin a
ON CONFLICT (class_id, attendance_date) DO UPDATE SET
  started_at = EXCLUDED.started_at,
  ended_at = NULL,
  status = 'open',
  created_by = EXCLUDED.created_by;

WITH today_students AS (
  SELECT sess.id AS session_id, sess.class_id, sess.attendance_date, sess.started_at,
         s.id AS student_id,
         row_number() OVER (ORDER BY s.name)::int AS number,
         fp.student_id IS NOT NULL AS has_face
  FROM attendance_sessions sess
  JOIN classes c ON c.id = sess.class_id AND c.name = 'X RPL 1'
  JOIN students s ON s.class_id = c.id AND s.nis LIKE 'DMY-%'
  LEFT JOIN face_profiles fp ON fp.student_id = s.id
  WHERE sess.attendance_date = CURRENT_DATE
), valued AS (
  SELECT *, CASE
    WHEN number <= 5 THEN 'present'
    WHEN number = 6 THEN 'late'
    WHEN number = 7 THEN 'sick'
    ELSE 'absent'
  END AS attendance_status
  FROM today_students
)
INSERT INTO attendance_records (
  session_id, student_id, class_id, attendance_date, status,
  check_in_at, confidence, method, notes
)
SELECT
  session_id,
  student_id,
  class_id,
  attendance_date,
  attendance_status,
  CASE attendance_status
    WHEN 'present' THEN started_at + ((number + 3) || ' minutes')::interval
    WHEN 'late' THEN started_at + interval '48 minutes'
    ELSE NULL
  END,
  CASE WHEN attendance_status IN ('present', 'late') AND has_face THEN (94 + number * 0.35)::numeric(5,2) ELSE NULL END,
  CASE WHEN attendance_status IN ('present', 'late') AND has_face THEN 'face' ELSE 'manual' END,
  CASE attendance_status
    WHEN 'sick' THEN 'Data dummy: surat keterangan sakit'
    WHEN 'absent' THEN 'Data dummy: belum hadir'
    ELSE NULL
  END
FROM valued
ON CONFLICT (session_id, student_id) DO UPDATE SET
  status = EXCLUDED.status,
  check_in_at = EXCLUDED.check_in_at,
  confidence = EXCLUDED.confidence,
  method = EXCLUDED.method,
  notes = EXCLUDED.notes;

DO $$
DECLARE
  v_students integer;
  v_faces integer;
  v_classes_without_guardian integer;
  v_classes_wrong_size integer;
  v_orphan_records integer;
BEGIN
  SELECT count(*) INTO v_students FROM students WHERE nis LIKE 'DMY-%';
  SELECT count(*) INTO v_faces FROM face_profiles fp JOIN students s ON s.id = fp.student_id WHERE s.nis LIKE 'DMY-%';
  SELECT count(*) INTO v_classes_without_guardian
    FROM classes c WHERE c.name IN ('X RPL 1','XI RPL 1','X TKJ 1','XI TKJ 1','X AKL 1','XI AKL 1','X MPLB 1','XI MPLB 1')
    AND c.homeroom_teacher_id IS NULL;
  SELECT count(*) INTO v_classes_wrong_size FROM (
    SELECT c.id FROM classes c JOIN students s ON s.class_id = c.id AND s.nis LIKE 'DMY-%'
    GROUP BY c.id HAVING count(*) <> 8
  ) invalid_classes;
  SELECT count(*) INTO v_orphan_records
    FROM attendance_records ar LEFT JOIN students s ON s.id = ar.student_id WHERE s.id IS NULL;

  IF v_students <> 64 THEN RAISE EXCEPTION 'Seed gagal: jumlah siswa %, seharusnya 64', v_students; END IF;
  IF v_faces <> 48 THEN RAISE EXCEPTION 'Seed gagal: jumlah profil wajah %, seharusnya 48', v_faces; END IF;
  IF v_classes_without_guardian <> 0 THEN RAISE EXCEPTION 'Seed gagal: ada kelas tanpa guru wali'; END IF;
  IF v_classes_wrong_size <> 0 THEN RAISE EXCEPTION 'Seed gagal: jumlah siswa per kelas bukan 8'; END IF;
  IF v_orphan_records <> 0 THEN RAISE EXCEPTION 'Seed gagal: ada catatan absensi yatim'; END IF;
END;
$$;

ANALYZE majors;
ANALYZE teachers;
ANALYZE classes;
ANALYZE students;
ANALYZE face_profiles;
ANALYZE attendance_sessions;
ANALYZE attendance_records;

COMMIT;

SELECT 'majors' AS feature, count(*) AS total FROM majors WHERE code IN ('RPL','TKJ','AKL','MPLB')
UNION ALL SELECT 'teachers', count(*) FROM teachers WHERE nip LIKE 'DMY-%'
UNION ALL SELECT 'classes', count(*) FROM classes WHERE name IN ('X RPL 1','XI RPL 1','X TKJ 1','XI TKJ 1','X AKL 1','XI AKL 1','X MPLB 1','XI MPLB 1')
UNION ALL SELECT 'students', count(*) FROM students WHERE nis LIKE 'DMY-%'
UNION ALL SELECT 'face_profiles', count(*) FROM face_profiles fp JOIN students s ON s.id = fp.student_id WHERE s.nis LIKE 'DMY-%'
UNION ALL SELECT 'attendance_sessions', count(*) FROM attendance_sessions sess JOIN classes c ON c.id = sess.class_id WHERE c.name IN ('X RPL 1','XI RPL 1','X TKJ 1','XI TKJ 1','X AKL 1','XI AKL 1','X MPLB 1','XI MPLB 1')
UNION ALL SELECT 'attendance_records', count(*) FROM attendance_records ar JOIN students s ON s.id = ar.student_id WHERE s.nis LIKE 'DMY-%'
ORDER BY feature;

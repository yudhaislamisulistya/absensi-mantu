-- Hapus data demonstrasi lama dan pertahankan hanya jurusan Kuliner serta TJKT.

BEGIN;
SET LOCAL TIME ZONE 'Asia/Jakarta';

DO $$
BEGIN
  IF (SELECT count(*) FROM majors WHERE code IN ('KULINER', 'TJKT')) <> 2 THEN
    RAISE EXCEPTION 'Pembersihan dibatalkan: jurusan KULINER dan TJKT tidak ditemukan lengkap';
  END IF;
END;
$$;

DELETE FROM students student
WHERE NOT EXISTS (
  SELECT 1
  FROM classes class
  JOIN majors major ON major.id = class.major_id
  WHERE class.id = student.class_id
    AND major.code IN ('KULINER', 'TJKT')
);

DELETE FROM classes class
WHERE NOT EXISTS (
  SELECT 1 FROM majors major
  WHERE major.id = class.major_id
    AND major.code IN ('KULINER', 'TJKT')
);

DELETE FROM majors WHERE code NOT IN ('KULINER', 'TJKT');
DELETE FROM teachers WHERE nip LIKE 'DMY-%';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM majors WHERE code NOT IN ('KULINER', 'TJKT')) THEN
    RAISE EXCEPTION 'Pembersihan gagal: masih ada jurusan selain KULINER dan TJKT';
  END IF;
  IF EXISTS (
    SELECT 1 FROM classes class
    LEFT JOIN majors major ON major.id = class.major_id
    WHERE major.code IS NULL OR major.code NOT IN ('KULINER', 'TJKT')
  ) THEN
    RAISE EXCEPTION 'Pembersihan gagal: masih ada kelas di luar KULINER dan TJKT';
  END IF;
  IF EXISTS (
    SELECT 1 FROM students student
    LEFT JOIN classes class ON class.id = student.class_id
    LEFT JOIN majors major ON major.id = class.major_id
    WHERE major.code IS NULL OR major.code NOT IN ('KULINER', 'TJKT')
  ) THEN
    RAISE EXCEPTION 'Pembersihan gagal: masih ada siswa di luar KULINER dan TJKT';
  END IF;
  IF EXISTS (SELECT 1 FROM teachers WHERE nip LIKE 'DMY-%') THEN
    RAISE EXCEPTION 'Pembersihan gagal: masih ada guru dengan NIP DMY';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;

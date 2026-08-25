-- Izinkan penghapusan siswa/kelas dengan membersihkan riwayat terkait.

BEGIN;

ALTER TABLE attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_student_id_fkey,
  ADD CONSTRAINT attendance_records_student_id_fkey
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;

ALTER TABLE attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_class_id_fkey,
  ADD CONSTRAINT attendance_records_class_id_fkey
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;

NOTIFY pgrst, 'reload schema';
COMMIT;

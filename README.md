# Absensi Mantu

Sistem administrasi dan absensi siswa berbasis pengenalan wajah. Frontend dibuat dengan React, Vite, dan Tailwind CSS; data disimpan di PostgreSQL dan disajikan melalui PostgREST.

## Fitur

- Manajemen siswa, kelas, guru, jurusan, dan guru wali.
- Import Excel beserta template XLSX dan validasi untuk seluruh data master.
- Pagination pada tabel data master dan laporan.
- Registrasi lima sampel wajah per siswa dan guru melalui kamera browser dengan pemeriksaan kualitas, jarak, dan pencahayaan.
- Pengaturan waktu masuk, waktu pulang, dan batas toleransi dari menu admin.
- Satu sesi absensi sekolah per hari di ruang guru dengan mode wajah masuk/pulang, konfirmasi tiga frame, pemeriksaan kandidat ambigu, skor kecocokan, dan pencegahan check-in berulang.
- Petunjuk kegagalan pemindaian ditampilkan secara senyap di area kamera, sedangkan pencatatan baru yang berhasil memutar rekaman suara Indonesia “Absensi berhasil dilakukan” bervolume maksimum.
- Absensi wajah masuk/pulang guru, koreksi status manual, dan reset data pengujian hari ini.
- Tanggal absensi dan reset sesi hari ini untuk pengujian ulang dengan konfirmasi pengaman.
- Koreksi status dan pencatatan pulang manual untuk siswa tanpa profil wajah.
- Filter siswa per kelas lengkap dengan jumlah siswa pada setiap kelas.
- Laporan siswa dan guru untuk periode mingguan, bulanan, dan semester.
- Ekspor laporan Excel terformat dengan sheet ringkasan dan data detail serta tampilan ramah cetak.
- Login admin berbasis JWT serta password bcrypt (`pgcrypto`).

## Arsitektur dan port

| Service | Container | Port host |
|---|---|---:|
| React + Nginx | `absensi_mantu_frontend` | `7109` |
| PostgREST | `absensi_mantu_postgrest_api` | `8108` |
| PostgreSQL 15 | `absensi_mantu_postgres_db` | `5452` |

Browser mengakses API lewat URL same-origin `/api`, kemudian Nginx meneruskannya ke PostgREST. Dengan pola ini token tidak perlu dikirim ke origin atau port lain.

## Menjalankan

```bash
cp .env.example .env
# ganti POSTGRES_PASSWORD dan APP_JWT_SECRET dengan nilai acak yang kuat
docker compose up -d --build
```

Periksa service:

```bash
docker compose ps
curl http://localhost:7109/health
```

Login awal:

- Username: `admin`
- Password: `123456789`

Segera ubah password melalui menu profil → **Ubah password** setelah login pertama.

## Alur penggunaan

1. Tambahkan jurusan dan guru.
2. Tambahkan kelas, kemudian pilih guru wali.
3. Tambahkan siswa dan tempatkan ke kelas.
4. Buka **Registrasi Wajah**, pilih tab siswa atau guru, lalu ambil lima sampel sesuai petunjuk arah wajah.
5. Atur jadwal melalui **Pengaturan Waktu**. Batas terlambat adalah waktu masuk + toleransi, sedangkan absensi pulang dibuka pada waktu pulang − toleransi.
6. Buka **Absensi Siswa**, mulai satu sesi sekolah, lalu pilih mode **Absensi masuk** atau **Absensi pulang** sebelum mengaktifkan kamera.
7. Sistem mencocokkan wajah dengan seluruh siswa aktif dan tetap menampilkan kelas serta kedua waktu absensinya.
8. Selesaikan sesi dan buka **Laporan** untuk melihat rekap masuk/pulang.
9. Gunakan **Absensi Guru** untuk memindai wajah masuk/pulang guru dan menampilkan rekapnya pada tab laporan guru.

## Catatan pengenalan wajah

- Kamera browser membutuhkan HTTPS atau `localhost` dan izin eksplisit dari pengguna.
- Ambil sampel di ruangan terang, tanpa penutup wajah, dari posisi lurus serta sedikit ke kiri/kanan.
- Ambang bawaan adalah jarak Euclidean `0.500`; nilai lebih kecil lebih ketat.
- Keputusan identitas memakai median jarak dari tiga frame berurutan, bukan satu frame terakhir.
- Skor verifikasi bukan probabilitas statistik: jarak `0` dipetakan ke skor `100`, sedangkan jarak tepat pada ambang penolakan dipetakan ke `70`. Jarak mentah tetap disimpan untuk audit.
- Foto pratinjau dan descriptor wajah merupakan data biometrik. Batasi akses admin, gunakan HTTPS, dan terapkan kebijakan retensi/persetujuan sekolah.

## Pengembangan frontend

```bash
cd fe-absensi-mantu
npm install
npm run dev
```

Vite akan mem-proxy `/api` ke `http://localhost:8108`. Build produksi dibuat dengan `npm run build`.

## Migrasi dari versi absensi per kelas

Cadangkan database, lalu jalankan migrasi satu kali sebelum membangun ulang frontend:

```bash
docker exec -i absensi_mantu_postgres_db \
  psql -U absensi_mantu -d absensi_mantu -v ON_ERROR_STOP=1 \
  < database/02_schoolwide_attendance.sql
docker exec -i absensi_mantu_postgres_db \
  psql -U absensi_mantu -d absensi_mantu -v ON_ERROR_STOP=1 \
  < database/03_reset_attendance.sql
docker exec -i absensi_mantu_postgres_db \
  psql -U absensi_mantu -d absensi_mantu -v ON_ERROR_STOP=1 \
  < database/04_entry_exit_attendance.sql
docker exec -i absensi_mantu_postgres_db \
  psql -U absensi_mantu -d absensi_mantu -v ON_ERROR_STOP=1 \
  < database/05_allow_student_class_deletion.sql
docker exec -i absensi_mantu_postgres_db \
  psql -U absensi_mantu -d absensi_mantu -v ON_ERROR_STOP=1 \
  < database/06_teacher_attendance.sql
docker exec -i absensi_mantu_postgres_db \
  psql -U absensi_mantu -d absensi_mantu -v ON_ERROR_STOP=1 \
  < database/07_remove_legacy_dummy_data.sql
docker exec -i absensi_mantu_postgres_db \
  psql -U absensi_mantu -d absensi_mantu -v ON_ERROR_STOP=1 \
  < database/08_teacher_face_and_match_score.sql
docker compose up -d --build
```

Migrasi menggabungkan sesi per kelas pada tanggal yang sama menjadi satu sesi sekolah, menambahkan reset pengujian, jadwal dan absensi pulang, absensi guru, serta mengizinkan penghapusan siswa/kelas beserta riwayat absensi terkait.

## Data demonstrasi

Seed demonstrasi lama telah dinonaktifkan agar data jurusan, kelas, siswa, dan guru
yang sudah dihapus tidak dapat muncul kembali saat deployment.

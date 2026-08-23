# Absensi Mantu

Sistem administrasi dan absensi siswa berbasis pengenalan wajah. Frontend dibuat dengan React, Vite, dan Tailwind CSS; data disimpan di PostgreSQL dan disajikan melalui PostgREST.

## Fitur

- Manajemen siswa, kelas, guru, jurusan, dan guru wali.
- Import Excel beserta template XLSX dan validasi untuk seluruh data master.
- Pagination pada tabel data master dan laporan.
- Registrasi tiga sampel wajah per siswa melalui kamera browser.
- Pengaturan waktu masuk, waktu pulang, dan batas toleransi dari menu admin.
- Satu sesi absensi sekolah per hari di ruang guru dengan mode wajah masuk/pulang, skor kecocokan, dan pencegahan check-in berulang.
- Tanggal absensi dan reset sesi hari ini untuk pengujian ulang dengan konfirmasi pengaman.
- Koreksi status dan pencatatan pulang manual untuk siswa tanpa profil wajah.
- Filter siswa per kelas lengkap dengan jumlah siswa pada setiap kelas.
- Laporan mingguan, bulanan, dan semester per hari/per siswa/per kelas.
- Ekspor laporan ke CSV dan tampilan ramah cetak.
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
4. Buka **Registrasi Wajah**, pilih siswa, lalu ambil tiga sampel.
5. Atur jadwal melalui **Pengaturan Waktu**. Batas terlambat adalah waktu masuk + toleransi, sedangkan absensi pulang dibuka pada waktu pulang − toleransi.
6. Buka **Absensi Siswa**, mulai satu sesi sekolah, lalu pilih mode **Absensi masuk** atau **Absensi pulang** sebelum mengaktifkan kamera.
7. Sistem mencocokkan wajah dengan seluruh siswa aktif dan tetap menampilkan kelas serta kedua waktu absensinya.
8. Selesaikan sesi dan buka **Laporan** untuk melihat rekap masuk/pulang.

## Catatan pengenalan wajah

- Kamera browser membutuhkan HTTPS atau `localhost` dan izin eksplisit dari pengguna.
- Ambil sampel di ruangan terang, tanpa penutup wajah, dari posisi lurus serta sedikit ke kiri/kanan.
- Ambang bawaan adalah jarak Euclidean `0.500`; nilai lebih kecil lebih ketat.
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
docker compose up -d --build
```

Migrasi menggabungkan sesi per kelas pada tanggal yang sama menjadi satu sesi sekolah, menambahkan reset pengujian, serta menambahkan jadwal dan absensi pulang. Kolom kelas pada catatan kehadiran tetap dipertahankan sebagai snapshot untuk laporan historis.

## Data demonstrasi

Seed berikut mengisi 4 jurusan, 12 guru, 8 kelas beserta guru wali, 64 siswa,
48 profil wajah sintetis, serta riwayat absensi semester berjalan:

```bash
docker exec -i absensi_mantu_postgres_db \
  psql -U absensi_mantu -d absensi_mantu -v ON_ERROR_STOP=1 \
  < database/seed_dummy.sql
```

Seed bersifat idempotent dan dapat dijalankan ulang. NIP/NIS demonstrasi memakai
awalan `DMY-`. Descriptor wajah pada seed hanya untuk pratinjau; daftarkan ulang
wajah siswa melalui kamera sebelum menggunakan data sebagai absensi nyata.

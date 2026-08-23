# Absensi Mantu

Sistem administrasi dan absensi siswa berbasis pengenalan wajah. Frontend dibuat dengan React, Vite, dan Tailwind CSS; data disimpan di PostgreSQL dan disajikan melalui PostgREST.

## Fitur

- Manajemen siswa, kelas, guru, jurusan, dan guru wali.
- Registrasi tiga sampel wajah per siswa melalui kamera browser.
- Absensi wajah per kelas dengan skor kecocokan dan pencegahan check-in berulang.
- Koreksi status manual: hadir, terlambat, sakit, izin, atau alfa.
- Laporan mingguan, bulanan, dan semester per siswa/per kelas.
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
5. Buka **Absensi Kelas**, pilih kelas, dan mulai sesi hari ini.
6. Aktifkan kamera; sistem akan mencocokkan wajah dengan siswa pada kelas tersebut.
7. Selesaikan sesi dan buka **Laporan** untuk melihat rekap.

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

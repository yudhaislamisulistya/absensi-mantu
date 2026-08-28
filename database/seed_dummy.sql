-- Dinonaktifkan: data produksi tidak boleh diisi ulang dengan dataset demonstrasi lama.
-- Berkas dipertahankan sebagai no-op agar perintah deployment lama tidak menambah data.

BEGIN;
SELECT 'Seed dummy dinonaktifkan; tidak ada data yang ditambahkan.' AS message;
COMMIT;

-- =====================================================================
-- Isi & aturan satu node wilayah. Jalankan di NODE mana saja, contoh:
--   docker compose exec node-timur psql -U postgres -d mbg -f /verify/04_node.sql
-- =====================================================================

\echo '== 1. Saya node apa? (predikat fragmen: prov_min <= kode_provinsi < prov_max) =='
SELECT * FROM info_node;

\echo '== 2. Isi fragmen lokal =='
SELECT (SELECT count(*) FROM identitas)   AS identitas,
       (SELECT count(*) FROM sosek)       AS sosek,
       (SELECT count(*) FROM klasifikasi) AS klasifikasi;

\echo '== 3. Tabel referensi hasil logical replication dari pusat =='
SELECT (SELECT count(*) FROM ref_wilayah_node)     AS wilayah,
       (SELECT count(*) FROM ref_program)          AS program,
       (SELECT count(*) FROM ref_garis_kemiskinan) AS garis_kemiskinan;
SELECT subname, pid IS NOT NULL AS worker_aktif, latest_end_time
FROM pg_stat_subscription WHERE relid IS NULL;

\echo '== 4. Uji DISJOINTNESS: sisipkan provinsi milik node LAIN -> harus DITOLAK (cek_fragmen_horizontal) =='
BEGIN;
INSERT INTO identitas (nim, nama, jenis_kelamin, tanggal_lahir, kode_provinsi)
SELECT '99999999999', 'Uji Salah Fragmen', 'L', DATE '2000-01-01',
       CASE WHEN prov_min = 11 THEN 31 ELSE 11 END
FROM info_node;
ROLLBACK;

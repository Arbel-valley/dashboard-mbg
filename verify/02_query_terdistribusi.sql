-- =====================================================================
-- Query terdistribusi & transparansi lokasi. Jalankan di PUSAT:
--   docker compose exec pusat psql -U postgres -d mbg -f /verify/02_query_terdistribusi.sql
-- =====================================================================

\echo '== 1. Partition pruning: filter kode_provinsi = 32 -> HANYA node-tengah yang ditanya =='
EXPLAIN (VERBOSE, COSTS OFF)
SELECT nim, nama FROM identitas WHERE kode_provinsi = 32;

\echo '== 2. Join + agregat di-pushdown ke tiap node, paralel (cari "Async Foreign Scan" & "Remote SQL") =='
EXPLAIN (VERBOSE, COSTS OFF)
SELECT i.kode_provinsi, count(*) AS jumlah, sum(s.penghasilan_bulanan) AS total_penghasilan
FROM identitas i
JOIN sosek s ON s.nim = i.nim AND s.kode_provinsi = i.kode_provinsi
GROUP BY i.kode_provinsi;

\echo '== 3. Hasil query yang sama =='
\timing on
SELECT i.kode_provinsi, count(*) AS jumlah, sum(s.penghasilan_bulanan) AS total_penghasilan
FROM identitas i
JOIN sosek s ON s.nim = i.nim AND s.kode_provinsi = i.kode_provinsi
GROUP BY i.kode_provinsi
ORDER BY 1;
\timing off

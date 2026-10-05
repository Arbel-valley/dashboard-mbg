-- =====================================================================
-- Uji kebenaran fragmentasi. Jalankan di PUSAT:
--   docker compose exec pusat psql -U postgres -d mbg -f /verify/01_fragmentasi.sql
-- =====================================================================
\pset null '-'

\echo '== 1. Isi tiap fragmen horizontal (perhatikan range kode_provinsi) =='
SELECT tableoid::regclass AS fragmen, count(*) AS baris,
       min(kode_provinsi) AS kode_min, max(kode_provinsi) AS kode_max
FROM identitas
GROUP BY 1 ORDER BY 1;

\echo '== 2. COMPLETENESS: total baris semua fragmen = total di direktori (lengkap = t) =='
SELECT (SELECT count(*) FROM identitas)          AS total_fragmen,
       (SELECT count(*) FROM direktori_penduduk) AS total_direktori,
       (SELECT count(*) FROM identitas) = (SELECT count(*) FROM direktori_penduduk) AS lengkap;

\echo '== 3. DISJOINTNESS: NIM yang muncul di lebih dari satu fragmen (harus 0 baris) =='
SELECT nim, count(*) AS muncul
FROM identitas
GROUP BY nim HAVING count(*) > 1;

\echo '== 4. RECONSTRUCTION (vertikal): identitas JOIN sosek harus utuh (tiga angka sama) =='
SELECT (SELECT count(*) FROM identitas) AS identitas,
       (SELECT count(*) FROM sosek)     AS sosek,
       (SELECT count(*) FROM identitas i
               JOIN sosek s ON s.nim = i.nim AND s.kode_provinsi = i.kode_provinsi) AS hasil_join;

\echo '== 5. Direktori menunjuk node yang benar (harus 0 baris) =='
SELECT d.nim, d.node AS menurut_direktori, i.tableoid::regclass AS lokasi_sebenarnya
FROM direktori_penduduk d
JOIN identitas i ON i.nim = d.nim
WHERE i.tableoid::regclass::text <> 'identitas_' || d.node;

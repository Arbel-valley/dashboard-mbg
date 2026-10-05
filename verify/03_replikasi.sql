-- =====================================================================
-- Status replikasi. Jalankan di PUSAT:
--   docker compose exec pusat psql -U postgres -d mbg -f /verify/03_replikasi.sql
-- =====================================================================

\echo '== 1. Semua koneksi replikasi dari pusat (state harus streaming) =='
\echo '   fisik   = replica (salinan utuh pusat)'
\echo '   logical = node wilayah (hanya tabel referensi)'
SELECT r.application_name,
       CASE WHEN a.datname IS NULL THEN 'fisik' ELSE 'logical' END AS jenis,
       r.state, r.replay_lag
FROM pg_stat_replication r
JOIN pg_stat_activity a USING (pid)
ORDER BY jenis, r.application_name;

\echo '== 2. Publication: tabel referensi yang disalin ke node wilayah =='
SELECT pubname, tablename FROM pg_publication_tables ORDER BY tablename;

\echo '== 3. Slot logical replication per node (active = t berarti node sedang tersambung) =='
SELECT slot_name, plugin, active FROM pg_replication_slots ORDER BY slot_name;

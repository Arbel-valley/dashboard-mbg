-- =====================================================================
-- Transaksi 2PC yang sedang in-doubt (masih PREPARED) di node ini.
-- Jalankan di pusat ATAU node mana saja, contoh:
--   docker compose exec node-tengah psql -U postgres -d mbg -f /verify/07_2pc.sql
-- =====================================================================

\echo '== Transaksi PREPARED (in-doubt) di node ini =='
SELECT gid, prepared, owner FROM pg_prepared_xacts
WHERE database = current_database() ORDER BY prepared;

SELECT to_regclass('twopc_log') IS NOT NULL AS ini_pusat \gset
\if :ini_pusat
\echo '== Log koordinator (10 terakhir) =='
SELECT gid, operasi, peserta, status, keterangan, diubah
FROM twopc_log ORDER BY diubah DESC LIMIT 10;
\endif

-- =====================================================================
-- Hot standby. Jalankan di REPLICA:
--   docker compose exec replica psql -U postgres -d mbg -f /verify/06_replica.sql
-- =====================================================================

\echo '== 1. Benar standby? (standby = t) dan sudah sinkron? (semua_wal_diterapkan = t) =='
\echo '   Catatan: jangan ukur lag dengan now() - pg_last_xact_replay_timestamp();'
\echo '   angka itu terus membesar saat pusat idle walaupun replica sudah sinkron.'
SELECT pg_is_in_recovery() AS standby,
       pg_last_wal_receive_lsn() = pg_last_wal_replay_lsn() AS semua_wal_diterapkan,
       pg_last_xact_replay_timestamp() AS transaksi_terakhir_diterapkan;

\echo '== 2. Data direktori ikut tersalin dari pusat =='
SELECT node, count(*) FROM direktori_penduduk GROUP BY node ORDER BY node;

\echo '== 3. Coba menulis -> harus DITOLAK (read-only transaction) =='
INSERT INTO twopc_log (gid, operasi, status) VALUES ('uji-replica', 'uji', 'MULAI');

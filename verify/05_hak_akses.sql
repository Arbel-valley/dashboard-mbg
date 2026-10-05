-- =====================================================================
-- Fragmentasi vertikal sebagai kontrol akses (data minimization).
-- Jalankan SEBAGAI ai_reader di node mana saja, contoh:
--   docker compose exec node-barat psql -U ai_reader -d mbg -f /verify/05_hak_akses.sql
-- =====================================================================

\echo '== 1. ai_reader BOLEH membaca fragmen sosek =='
SELECT nim, penghasilan_bulanan, jumlah_art FROM sosek LIMIT 3;

\echo '== 2. ai_reader TIDAK BOLEH membaca fragmen identitas (harus: permission denied) =='
SELECT nim, nama FROM identitas LIMIT 3;

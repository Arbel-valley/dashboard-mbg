#!/usr/bin/env bash
# =====================================================================
# PUSAT — 01: role & izin koneksi
# Dijalankan otomatis oleh image postgres HANYA saat volume masih kosong.
# (Mau jalan ulang? `docker compose down -v` lalu `up` lagi.)
# =====================================================================
# Catatan: sengaja TANPA `set -u` — kalau file ini tidak executable, image postgres
# akan men-source-nya dan `set -u` bisa ikut berlaku di entrypoint image.
set -eo pipefail

: "${APP_PASSWORD:?APP_PASSWORD wajib diisi}"
: "${REPLICATOR_PASSWORD:?REPLICATOR_PASSWORD wajib diisi}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
     -v app_pw="$APP_PASSWORD" \
     -v repl_pw="$REPLICATOR_PASSWORD" <<'EOSQL'
-- Akun backend FastAPI
CREATE ROLE app_user LOGIN PASSWORD :'app_pw';

-- Akun replikasi, dipakai oleh:
--   * replica      -> streaming replication (fisik)
--   * node wilayah -> logical replication tabel referensi
CREATE ROLE replicator LOGIN REPLICATION PASSWORD :'repl_pw';

-- Supaya backend bisa membaca pg_stat_replication secara lengkap (halaman Status Cluster)
GRANT pg_read_all_stats TO app_user;
EOSQL

# Izinkan koneksi replikasi FISIK dari container replica.
# Catatan: kata kunci "all" di kolom database pg_hba TIDAK mencakup
# koneksi replikasi fisik, jadi harus ditulis eksplisit "replication".
echo "host replication replicator all scram-sha-256" >> "$PGDATA/pg_hba.conf"

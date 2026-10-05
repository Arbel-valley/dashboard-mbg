#!/usr/bin/env bash
# =====================================================================
# NODE WILAYAH — 01: role
# File di folder ini dipakai BERSAMA oleh node-barat, node-tengah,
# node-timur. Bedanya hanya dari env NODE_NAME / PROV_MIN / PROV_MAX.
# =====================================================================
# Catatan: sengaja TANPA `set -u` — kalau file ini tidak executable, image postgres
# akan men-source-nya dan `set -u` bisa ikut berlaku di entrypoint image.
set -eo pipefail

: "${APP_PASSWORD:?APP_PASSWORD wajib diisi}"
: "${FDW_PASSWORD:?FDW_PASSWORD wajib diisi}"
: "${AI_PASSWORD:?AI_PASSWORD wajib diisi}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
     -v app_pw="$APP_PASSWORD" \
     -v fdw_pw="$FDW_PASSWORD" \
     -v ai_pw="$AI_PASSWORD" <<'EOSQL'
-- Backend FastAPI: baca/tulis (tulis lintas node lewat 2PC)
CREATE ROLE app_user  LOGIN PASSWORD :'app_pw';
-- Dipakai pusat lewat postgres_fdw: HANYA BACA
CREATE ROLE fdw_user  LOGIN PASSWORD :'fdw_pw';
-- Dipakai layanan AI: hanya fragmen sosek, TANPA akses identitas
CREATE ROLE ai_reader LOGIN PASSWORD :'ai_pw';

GRANT pg_read_all_stats TO app_user;
EOSQL

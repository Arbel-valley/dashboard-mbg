#!/usr/bin/env bash
# =====================================================================
# NODE WILAYAH — 03: predikat fragmen horizontal milik node INI
#   node-barat  : 11 <= kode_provinsi < 30
#   node-tengah : 30 <= kode_provinsi < 52
#   node-timur  : 52 <= kode_provinsi < 100
# CHECK ini menjaga DISJOINTNESS: node menolak data provinsi milik node lain.
# =====================================================================
# Catatan: sengaja TANPA `set -u` — kalau file ini tidak executable, image postgres
# akan men-source-nya dan `set -u` bisa ikut berlaku di entrypoint image.
set -eo pipefail

: "${NODE_NAME:?NODE_NAME wajib diisi}"
: "${PROV_MIN:?PROV_MIN wajib diisi}"
: "${PROV_MAX:?PROV_MAX wajib diisi}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
     -v node="$NODE_NAME" -v prov_min="$PROV_MIN" -v prov_max="$PROV_MAX" <<'EOSQL'
ALTER TABLE identitas
    ADD CONSTRAINT cek_fragmen_horizontal
    CHECK (kode_provinsi >= :prov_min AND kode_provinsi < :prov_max);

-- Identitas node (dipakai halaman Status Cluster & untuk belajar: "saya node apa?")
CREATE TABLE info_node (
    nama      text     PRIMARY KEY,
    prov_min  smallint NOT NULL,
    prov_max  smallint NOT NULL
);
INSERT INTO info_node VALUES (:'node', :prov_min, :prov_max);
GRANT SELECT ON info_node TO app_user, fdw_user, ai_reader;
EOSQL

echo "[init] node $NODE_NAME: fragmen kode_provinsi [$PROV_MIN, $PROV_MAX)"

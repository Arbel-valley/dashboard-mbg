#!/usr/bin/env bash
# =====================================================================
# REPLICA — entrypoint
# Saat volume masih kosong: salin seluruh data pusat (pg_basebackup),
# tulis konfigurasi standby (-R), lalu jalankan postgres seperti biasa.
# Selanjutnya replica menerima WAL dari pusat secara streaming.
# =====================================================================
set -euo pipefail

PGDATA="${PGDATA:-/var/lib/postgresql/data}"

if [ ! -s "$PGDATA/PG_VERSION" ]; then
    echo "[replica] data kosong -> menunggu pusat siap..."
    until pg_isready -h pusat -p 5432 -q; do
        sleep 2
    done

    mkdir -p "$PGDATA"
    chown postgres:postgres "$PGDATA"
    chmod 700 "$PGDATA"
    # bersihkan sisa percobaan yang gagal (kalau ada)
    find "$PGDATA" -mindepth 1 -delete

    echo "[replica] pg_basebackup dari pusat..."
    # Password ditaruh di connection string supaya ikut tertulis di
    # primary_conninfo (opsi -R) -> dipakai walreceiver untuk streaming.
    gosu postgres pg_basebackup \
        -d "host=pusat port=5432 user=replicator password=${REPLICATOR_PASSWORD} application_name=replica" \
        -D "$PGDATA" -Fp -Xs -P -R

    echo "[replica] base backup selesai -> start sebagai hot standby"
fi

exec docker-entrypoint.sh "$@"

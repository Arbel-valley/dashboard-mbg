#!/usr/bin/env bash
# =====================================================================
# SETUP — dijalankan sekali oleh service `setup` setelah semua node sehat.
# Aman dijalankan berulang (idempotent).
#   1. Buat SUBSCRIPTION di tiap node wilayah ke publication pusat
#   2. Tunggu sampai tabel referensi tersalin ke semua node
#   3. Uji koneksi FDW dari pusat ke 3 node
# =====================================================================
set -euo pipefail

export PGPASSWORD="$POSTGRES_PASSWORD"
PSQL=(psql -v ON_ERROR_STOP=1 -U postgres -d mbg -X -q -t -A)

echo "== [1/3] Subscription tabel referensi di tiap node =="
for NODE in barat tengah timur; do
    HOST="node-$NODE"
    SUB="sub_ref_$NODE"   # nama unik per node: nama slot replikasi di pusat ikut nama ini
    ADA=$("${PSQL[@]}" -h "$HOST" -c "SELECT count(*) FROM pg_subscription WHERE subname = '$SUB'")
    if [ "$ADA" = "0" ]; then
        "${PSQL[@]}" -h "$HOST" -c "CREATE SUBSCRIPTION $SUB
            CONNECTION 'host=pusat port=5432 dbname=mbg user=replicator password=$REPLICATOR_PASSWORD'
            PUBLICATION pub_referensi"
        echo "   $HOST: subscription $SUB dibuat"
    else
        echo "   $HOST: subscription $SUB sudah ada"
    fi
done

echo "== [2/3] Menunggu data referensi tersalin =="
for NODE in barat tengah timur; do
    HOST="node-$NODE"
    for i in $(seq 1 60); do
        N=$("${PSQL[@]}" -h "$HOST" -c "SELECT (SELECT count(*) FROM ref_wilayah_node)
                                             * (SELECT count(*) FROM ref_program)
                                             * (SELECT count(*) FROM ref_garis_kemiskinan)")
        if [ "$N" != "0" ]; then
            echo "   $HOST: referensi OK"
            break
        fi
        if [ "$i" = "60" ]; then
            echo "   $HOST: referensi BELUM tersalin setelah 60 detik — cek 'docker compose logs pusat $HOST'"
            exit 1
        fi
        sleep 1
    done
done

echo "== [3/3] Uji FDW dari pusat ke 3 node =="
"${PSQL[@]}" -h pusat -F ' | ' -c "
    SELECT 'identitas_barat',  count(*) FROM identitas_barat
    UNION ALL SELECT 'identitas_tengah', count(*) FROM identitas_tengah
    UNION ALL SELECT 'identitas_timur',  count(*) FROM identitas_timur ORDER BY 1" | sed 's/^/   /'

echo "Setup selesai. Lanjut: seed data -> docker compose exec backend python -m app.seed --jumlah 3000"

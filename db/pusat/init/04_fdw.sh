#!/usr/bin/env bash
# =====================================================================
# PUSAT — 04: postgres_fdw + tabel partisi (TRANSPARANSI LOKASI)
#
# Di pusat, tabel identitas/sosek/klasifikasi adalah tabel PARTISI yang
# partisinya berupa FOREIGN TABLE di node wilayah. Hasilnya:
#   SELECT ... FROM identitas   -> otomatis mengambil dari 3 node
#   ... WHERE kode_provinsi=32  -> partition pruning, hanya ke node-tengah
#
# CREATE SERVER / FOREIGN TABLE tidak menghubungi node saat dibuat,
# jadi aman dijalankan walaupun node wilayah belum hidup.
# =====================================================================
# Catatan: sengaja TANPA `set -u` — kalau file ini tidak executable, image postgres
# akan men-source-nya dan `set -u` bisa ikut berlaku di entrypoint image.
set -eo pipefail

: "${FDW_PASSWORD:?FDW_PASSWORD wajib diisi}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
     -v fdw_pw="$FDW_PASSWORD" <<'EOSQL'
CREATE EXTENSION postgres_fdw;

-- Opsi server (penting untuk QUERY TERDISTRIBUSI):
--   async_capable       : scan ke beberapa node dijalankan PARALEL, bukan satu per satu.
--   use_remote_estimate : optimizer pusat MENANYA node soal estimasi biaya (EXPLAIN remote).
--                         Tanpa ini, postgres_fdw menaksir biaya join remote seolah cross
--                         product kedua tabel, sehingga join + agregat TIDAK di-pushdown:
--                         pusat malah menarik semua baris lalu join sendiri (sudah diuji).
--   fdw_tuple_cost      : biaya kirim 1 baris lewat jaringan. 0.2 = default PostgreSQL 17;
--                         ditulis eksplisit supaya perilakunya sama di versi lain.
CREATE SERVER srv_barat  FOREIGN DATA WRAPPER postgres_fdw
    OPTIONS (host 'node-barat',  port '5432', dbname 'mbg', async_capable 'true',
             use_remote_estimate 'true', fdw_tuple_cost '0.2', fetch_size '1000');
CREATE SERVER srv_tengah FOREIGN DATA WRAPPER postgres_fdw
    OPTIONS (host 'node-tengah', port '5432', dbname 'mbg', async_capable 'true',
             use_remote_estimate 'true', fdw_tuple_cost '0.2', fetch_size '1000');
CREATE SERVER srv_timur  FOREIGN DATA WRAPPER postgres_fdw
    OPTIONS (host 'node-timur',  port '5432', dbname 'mbg', async_capable 'true',
             use_remote_estimate 'true', fdw_tuple_cost '0.2', fetch_size '1000');

-- Semua user di pusat masuk ke node sebagai fdw_user.
-- Di node, fdw_user HANYA punya hak SELECT: pusat bisa MEMBACA fragmen,
-- tapi semua TULIS lintas node wajib lewat koordinator 2PC di backend.
CREATE USER MAPPING FOR PUBLIC SERVER srv_barat  OPTIONS (user 'fdw_user', password :'fdw_pw');
CREATE USER MAPPING FOR PUBLIC SERVER srv_tengah OPTIONS (user 'fdw_user', password :'fdw_pw');
CREATE USER MAPPING FOR PUBLIC SERVER srv_timur  OPTIONS (user 'fdw_user', password :'fdw_pw');

-- ---------------------------------------------------------------------
-- Fragmen vertikal 1: IDENTITAS (data pribadi)
-- ---------------------------------------------------------------------
CREATE TABLE identitas (
    nim            varchar(20) NOT NULL,
    nama           text        NOT NULL,
    jenis_kelamin  char(1)     NOT NULL,
    tanggal_lahir  date        NOT NULL,
    alamat         text,
    kode_provinsi  smallint    NOT NULL,
    kategori_mbg   text[]      NOT NULL,
    dibuat         timestamptz NOT NULL
) PARTITION BY RANGE (kode_provinsi);

CREATE FOREIGN TABLE identitas_barat  PARTITION OF identitas FOR VALUES FROM (11) TO (30)
    SERVER srv_barat  OPTIONS (schema_name 'public', table_name 'identitas');
CREATE FOREIGN TABLE identitas_tengah PARTITION OF identitas FOR VALUES FROM (30) TO (52)
    SERVER srv_tengah OPTIONS (schema_name 'public', table_name 'identitas');
CREATE FOREIGN TABLE identitas_timur  PARTITION OF identitas FOR VALUES FROM (52) TO (100)
    SERVER srv_timur  OPTIONS (schema_name 'public', table_name 'identitas');

-- ---------------------------------------------------------------------
-- Fragmen vertikal 2: SOSEK (data sosial-ekonomi, tanpa nama/alamat)
-- kode_provinsi ikut disimpan agar sosek terfragmentasi sama persis
-- dengan identitas (derived horizontal fragmentation) -> join bisa
-- dikerjakan di masing-masing node.
-- ---------------------------------------------------------------------
CREATE TABLE sosek (
    nim                  varchar(20)  NOT NULL,
    kode_provinsi        smallint     NOT NULL,
    perkotaan            boolean      NOT NULL,
    penghasilan_bulanan  bigint       NOT NULL,
    jumlah_art           smallint     NOT NULL,
    pekerjaan_kk         text         NOT NULL,
    pendidikan_kk        text         NOT NULL,
    luas_lantai_m2       numeric(6,1) NOT NULL,
    jenis_lantai         text         NOT NULL,
    sumber_air           text         NOT NULL,
    daya_listrik_va      integer      NOT NULL,
    punya_motor          boolean      NOT NULL,
    punya_mobil          boolean      NOT NULL,
    punya_lahan          boolean      NOT NULL,
    diperbarui           timestamptz  NOT NULL
) PARTITION BY RANGE (kode_provinsi);

CREATE FOREIGN TABLE sosek_barat  PARTITION OF sosek FOR VALUES FROM (11) TO (30)
    SERVER srv_barat  OPTIONS (schema_name 'public', table_name 'sosek');
CREATE FOREIGN TABLE sosek_tengah PARTITION OF sosek FOR VALUES FROM (30) TO (52)
    SERVER srv_tengah OPTIONS (schema_name 'public', table_name 'sosek');
CREATE FOREIGN TABLE sosek_timur  PARTITION OF sosek FOR VALUES FROM (52) TO (100)
    SERVER srv_timur  OPTIONS (schema_name 'public', table_name 'sosek');

-- ---------------------------------------------------------------------
-- Hasil klasifikasi (skor & desil)
-- ---------------------------------------------------------------------
CREATE TABLE klasifikasi (
    nim            varchar(20)   NOT NULL,
    kode_provinsi  smallint      NOT NULL,
    skor           numeric(10,4) NOT NULL,
    desil          smallint      NOT NULL,
    metode         text          NOT NULL,
    dihitung       timestamptz   NOT NULL
) PARTITION BY RANGE (kode_provinsi);

CREATE FOREIGN TABLE klasifikasi_barat  PARTITION OF klasifikasi FOR VALUES FROM (11) TO (30)
    SERVER srv_barat  OPTIONS (schema_name 'public', table_name 'klasifikasi');
CREATE FOREIGN TABLE klasifikasi_tengah PARTITION OF klasifikasi FOR VALUES FROM (30) TO (52)
    SERVER srv_tengah OPTIONS (schema_name 'public', table_name 'klasifikasi');
CREATE FOREIGN TABLE klasifikasi_timur  PARTITION OF klasifikasi FOR VALUES FROM (52) TO (100)
    SERVER srv_timur  OPTIONS (schema_name 'public', table_name 'klasifikasi');

-- ---------------------------------------------------------------------
-- View gabungan (enak dipakai di DBeaver / laporan)
-- ---------------------------------------------------------------------
CREATE VIEW v_penduduk AS
SELECT i.nim, i.nama, i.jenis_kelamin, i.tanggal_lahir, i.kode_provinsi, i.kategori_mbg,
       s.perkotaan, s.penghasilan_bulanan, s.jumlah_art,
       round(s.penghasilan_bulanan::numeric / s.jumlah_art) AS penghasilan_per_kapita,
       k.skor, k.desil
FROM identitas i
JOIN sosek s            ON s.nim = i.nim AND s.kode_provinsi = i.kode_provinsi
LEFT JOIN klasifikasi k ON k.nim = i.nim AND k.kode_provinsi = i.kode_provinsi;

GRANT SELECT ON identitas, sosek, klasifikasi, v_penduduk TO app_user;
EOSQL

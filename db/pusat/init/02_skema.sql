-- =====================================================================
-- PUSAT — 02: skema lokal pusat
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) TABEL REFERENSI (master data)
--    Hanya boleh diubah di pusat. Otomatis disalin ke semua node wilayah
--    lewat LOGICAL REPLICATION (publication pub_referensi di bawah).
-- ---------------------------------------------------------------------

-- Skema ALOKASI: provinsi -> node. Harus konsisten dengan batas partisi
-- di 04_fdw.sh, dan konsistensinya dijaga CHECK di bawah.
CREATE TABLE ref_wilayah_node (
    kode_provinsi  smallint PRIMARY KEY,
    nama_provinsi  text     NOT NULL,
    node           text     NOT NULL,
    CONSTRAINT cek_alokasi CHECK (
        (node = 'barat'  AND kode_provinsi >= 11 AND kode_provinsi < 30)  OR
        (node = 'tengah' AND kode_provinsi >= 30 AND kode_provinsi < 52)  OR
        (node = 'timur'  AND kode_provinsi >= 52 AND kode_provinsi < 100)
    )
);

-- Aturan program: basis 'desil' (bansos, DTSEN) atau 'kategori' (MBG)
CREATE TABLE ref_program (
    kode         text     PRIMARY KEY,
    nama         text     NOT NULL,
    basis        text     NOT NULL CHECK (basis IN ('desil', 'kategori')),
    desil_maks   smallint CHECK (desil_maks BETWEEN 1 AND 10),
    dasar_hukum  text,
    CONSTRAINT cek_basis CHECK ((basis = 'desil') = (desil_maks IS NOT NULL))
);

-- Garis kemiskinan BPS (rupiah/kapita/bulan)
CREATE TABLE ref_garis_kemiskinan (
    periode            text    NOT NULL CHECK (periode ~ '^[0-9]{4}-[0-9]{2}$'),
    wilayah            text    NOT NULL CHECK (wilayah IN ('nasional', 'perkotaan', 'perdesaan')),
    rupiah_per_kapita  integer NOT NULL CHECK (rupiah_per_kapita > 0),
    sumber             text,
    PRIMARY KEY (periode, wilayah)
);

-- ---------------------------------------------------------------------
-- 2) KATALOG GLOBAL: direktori NIM -> node
--    * menjamin NIM unik SECARA GLOBAL (constraint unik biasa tidak bisa
--      menjangkau data yang tersebar di beberapa server)
--    * dipakai backend untuk mencari lokasi data (location lookup)
-- ---------------------------------------------------------------------
CREATE TABLE direktori_penduduk (
    nim            varchar(20) PRIMARY KEY CHECK (nim ~ '^[0-9]{8,20}$'),
    node           text        NOT NULL CHECK (node IN ('barat', 'tengah', 'timur')),
    kode_provinsi  smallint    NOT NULL REFERENCES ref_wilayah_node (kode_provinsi),
    didaftarkan    timestamptz NOT NULL DEFAULT now(),
    diubah         timestamptz
);
CREATE INDEX direktori_penduduk_node_idx ON direktori_penduduk (node);

-- ---------------------------------------------------------------------
-- 3) LOG KOORDINATOR 2PC
--    Ditulis backend di transaksi TERPISAH (autocommit) sehingga keputusan
--    COMMIT/ABORT tetap tercatat walau koordinator crash. Dipakai recovery.
-- ---------------------------------------------------------------------
CREATE TABLE twopc_log (
    gid         text        PRIMARY KEY,
    operasi     text        NOT NULL,
    peserta     text[]      NOT NULL DEFAULT '{}',
    status      text        NOT NULL CHECK (status IN ('MULAI', 'PREPARED', 'COMMIT', 'SELESAI', 'ABORT')),
    keterangan  text,
    dibuat      timestamptz NOT NULL DEFAULT now(),
    diubah      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX twopc_log_status_idx ON twopc_log (status);

-- ---------------------------------------------------------------------
-- 4) PUBLICATION untuk logical replication tabel referensi
-- ---------------------------------------------------------------------
CREATE PUBLICATION pub_referensi
    FOR TABLE ref_wilayah_node, ref_program, ref_garis_kemiskinan;

-- ---------------------------------------------------------------------
-- 5) Setelan optimizer untuk query terdistribusi:
--    join & agregat dikerjakan PER PARTISI -> bisa di-pushdown ke tiap node
-- ---------------------------------------------------------------------
ALTER DATABASE mbg SET enable_partitionwise_join = on;
ALTER DATABASE mbg SET enable_partitionwise_aggregate = on;

-- ---------------------------------------------------------------------
-- 6) Hak akses
-- ---------------------------------------------------------------------
GRANT SELECT ON ref_wilayah_node, ref_program, ref_garis_kemiskinan TO app_user, replicator;
GRANT SELECT, INSERT, UPDATE, DELETE ON direktori_penduduk TO app_user;
GRANT SELECT, INSERT, UPDATE ON twopc_log TO app_user;

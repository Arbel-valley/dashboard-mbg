-- =====================================================================
-- NODE WILAYAH — 02: skema fragmen
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Tabel REFERENSI: struktur sama dengan pusat, TAPI JANGAN diisi manual.
--    Isinya datang dari pusat lewat logical replication (dibuat oleh
--    service `setup`). Karena salinannya ada di sini, node bisa join dan
--    menghitung skor secara lokal tanpa bertanya ke pusat.
-- ---------------------------------------------------------------------
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

CREATE TABLE ref_program (
    kode         text     PRIMARY KEY,
    nama         text     NOT NULL,
    basis        text     NOT NULL CHECK (basis IN ('desil', 'kategori')),
    desil_maks   smallint CHECK (desil_maks BETWEEN 1 AND 10),
    dasar_hukum  text,
    CONSTRAINT cek_basis CHECK ((basis = 'desil') = (desil_maks IS NOT NULL))
);

CREATE TABLE ref_garis_kemiskinan (
    periode            text    NOT NULL CHECK (periode ~ '^[0-9]{4}-[0-9]{2}$'),
    wilayah            text    NOT NULL CHECK (wilayah IN ('nasional', 'perkotaan', 'perdesaan')),
    rupiah_per_kapita  integer NOT NULL CHECK (rupiah_per_kapita > 0),
    sumber             text,
    PRIMARY KEY (periode, wilayah)
);

-- ---------------------------------------------------------------------
-- 2) FRAGMEN VERTIKAL 1 — identitas (data pribadi)
--    Predikat fragmen horizontal (range kode_provinsi) ditambahkan
--    per node di 03_fragmen.sh sebagai CHECK constraint.
-- ---------------------------------------------------------------------
CREATE TABLE identitas (
    nim            varchar(20) PRIMARY KEY CHECK (nim ~ '^[0-9]{8,20}$'),
    nama           text        NOT NULL,
    jenis_kelamin  char(1)     NOT NULL CHECK (jenis_kelamin IN ('L', 'P')),
    tanggal_lahir  date        NOT NULL,
    alamat         text,
    -- FK LOKAL ke tabel referensi hasil replikasi: integritas dijaga di node sendiri
    kode_provinsi  smallint    NOT NULL REFERENCES ref_wilayah_node (kode_provinsi),
    kategori_mbg   text[]      NOT NULL DEFAULT '{}'
                   CHECK (kategori_mbg <@ ARRAY['peserta_didik', 'balita', 'ibu_hamil', 'ibu_menyusui', 'pendidik']::text[]),
    dibuat         timestamptz NOT NULL DEFAULT now(),
    -- target composite FK dari sosek & klasifikasi
    UNIQUE (nim, kode_provinsi)
);

-- ---------------------------------------------------------------------
-- 3) FRAGMEN VERTIKAL 2 — sosek (data sosial-ekonomi rumah tangga)
--    Kunci (nim) ikut disimpan agar fragmen bisa digabung kembali (join).
--    Composite FK + ON UPDATE CASCADE: kalau kode_provinsi di identitas
--    berubah (pindah provinsi dalam node yang sama), sosek ikut berubah.
-- ---------------------------------------------------------------------
CREATE TABLE sosek (
    nim                  varchar(20)  PRIMARY KEY,
    kode_provinsi        smallint     NOT NULL,
    perkotaan            boolean      NOT NULL,
    penghasilan_bulanan  bigint       NOT NULL CHECK (penghasilan_bulanan >= 0),
    jumlah_art           smallint     NOT NULL CHECK (jumlah_art BETWEEN 1 AND 20),
    pekerjaan_kk         text         NOT NULL,
    pendidikan_kk        text         NOT NULL,
    luas_lantai_m2       numeric(6,1) NOT NULL CHECK (luas_lantai_m2 > 0),
    jenis_lantai         text         NOT NULL CHECK (jenis_lantai IN ('tanah', 'semen', 'keramik')),
    sumber_air           text         NOT NULL CHECK (sumber_air IN ('sungai', 'sumur_tak_terlindung', 'sumur_terlindung', 'pdam', 'air_kemasan')),
    daya_listrik_va      integer      NOT NULL CHECK (daya_listrik_va >= 0),
    punya_motor          boolean      NOT NULL DEFAULT false,
    punya_mobil          boolean      NOT NULL DEFAULT false,
    punya_lahan          boolean      NOT NULL DEFAULT false,
    diperbarui           timestamptz  NOT NULL DEFAULT now(),
    FOREIGN KEY (nim, kode_provinsi) REFERENCES identitas (nim, kode_provinsi)
        ON UPDATE CASCADE ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- 4) Hasil klasifikasi (skor kesejahteraan & desil nasional)
-- ---------------------------------------------------------------------
CREATE TABLE klasifikasi (
    nim            varchar(20)   PRIMARY KEY,
    kode_provinsi  smallint      NOT NULL,
    skor           numeric(10,4) NOT NULL,
    desil          smallint      NOT NULL CHECK (desil BETWEEN 1 AND 10),
    metode         text          NOT NULL,
    dihitung       timestamptz   NOT NULL DEFAULT now(),
    FOREIGN KEY (nim, kode_provinsi) REFERENCES identitas (nim, kode_provinsi)
        ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX klasifikasi_desil_idx ON klasifikasi (desil);

-- ---------------------------------------------------------------------
-- 5) SKOR KESEJAHTERAAN — baseline rule-based (metode 'rule_v1')
--    Dihitung LOKAL di node (data tidak perlu dikirim ke mana-mana).
--    Nanti tinggal diganti/dibandingkan dengan model AI.
--
--    Inti skor: ln(pengeluaran-proxy per kapita / garis kemiskinan)
--      > 0  : di atas garis kemiskinan,  < 0 : di bawah
--    lalu dikoreksi indikator rumah & aset (mirip proxy means test).
-- ---------------------------------------------------------------------
CREATE FUNCTION hitung_skor(s sosek) RETURNS numeric
LANGUAGE sql STABLE AS $$
    SELECT round((
          ln(greatest(s.penghasilan_bulanan::numeric / s.jumlah_art, 1)
             / (SELECT g.rupiah_per_kapita
                FROM ref_garis_kemiskinan g
                WHERE g.wilayah = CASE WHEN s.perkotaan THEN 'perkotaan' ELSE 'perdesaan' END
                ORDER BY g.periode DESC
                LIMIT 1))
        + CASE s.jenis_lantai WHEN 'tanah' THEN -0.30 WHEN 'semen' THEN 0 ELSE 0.15 END
        + CASE WHEN s.sumber_air IN ('sungai', 'sumur_tak_terlindung') THEN -0.20 ELSE 0 END
        + CASE WHEN s.daya_listrik_va <= 450 THEN -0.20
               WHEN s.daya_listrik_va >= 2200 THEN 0.25
               ELSE 0 END
        -- salah satu kriteria rumah tangga miskin BPS: luas lantai < 8 m2 per orang
        + CASE WHEN s.luas_lantai_m2 / s.jumlah_art < 8 THEN -0.20 ELSE 0 END
        + CASE WHEN s.punya_mobil THEN 0.40 ELSE 0 END
        + CASE WHEN s.punya_motor THEN 0.10 ELSE 0 END
        + CASE WHEN s.punya_lahan THEN 0.10 ELSE 0 END
    )::numeric, 4)
$$;

-- ---------------------------------------------------------------------
-- 6) Hak akses (bagian dari desain SBDT + UU PDP: data minimization)
-- ---------------------------------------------------------------------
GRANT SELECT ON ref_wilayah_node, ref_program, ref_garis_kemiskinan TO app_user, fdw_user, ai_reader;
GRANT SELECT, INSERT, UPDATE, DELETE ON identitas, sosek, klasifikasi TO app_user;
GRANT SELECT ON identitas, sosek, klasifikasi TO fdw_user;   -- pusat: hanya baca
GRANT SELECT ON sosek, klasifikasi TO ai_reader;             -- AI: TIDAK bisa baca identitas

-- =====================================================================
-- PUSAT — 03: isi data referensi
-- Cukup diisi di pusat; node wilayah menerima salinannya otomatis
-- lewat logical replication.
-- =====================================================================

-- Kode provinsi = kode wilayah Kemendagri (2 digit awal NIK asli).
-- Alokasi: 11–29 barat, 30–51 tengah, 52–99 timur.
INSERT INTO ref_wilayah_node (kode_provinsi, nama_provinsi, node) VALUES
    (11, 'Aceh',                      'barat'),
    (12, 'Sumatera Utara',            'barat'),
    (13, 'Sumatera Barat',            'barat'),
    (14, 'Riau',                      'barat'),
    (15, 'Jambi',                     'barat'),
    (16, 'Sumatera Selatan',          'barat'),
    (17, 'Bengkulu',                  'barat'),
    (18, 'Lampung',                   'barat'),
    (19, 'Kepulauan Bangka Belitung', 'barat'),
    (21, 'Kepulauan Riau',            'barat'),
    (31, 'DKI Jakarta',               'tengah'),
    (32, 'Jawa Barat',                'tengah'),
    (33, 'Jawa Tengah',               'tengah'),
    (34, 'DI Yogyakarta',             'tengah'),
    (35, 'Jawa Timur',                'tengah'),
    (36, 'Banten',                    'tengah'),
    (51, 'Bali',                      'tengah'),
    (52, 'Nusa Tenggara Barat',       'timur'),
    (53, 'Nusa Tenggara Timur',       'timur'),
    (61, 'Kalimantan Barat',          'timur'),
    (62, 'Kalimantan Tengah',         'timur'),
    (63, 'Kalimantan Selatan',        'timur'),
    (64, 'Kalimantan Timur',          'timur'),
    (65, 'Kalimantan Utara',          'timur'),
    (71, 'Sulawesi Utara',            'timur'),
    (72, 'Sulawesi Tengah',           'timur'),
    (73, 'Sulawesi Selatan',          'timur'),
    (74, 'Sulawesi Tenggara',         'timur'),
    (75, 'Gorontalo',                 'timur'),
    (76, 'Sulawesi Barat',            'timur'),
    (81, 'Maluku',                    'timur'),
    (82, 'Maluku Utara',              'timur'),
    (91, 'Papua',                     'timur'),
    (92, 'Papua Barat',               'timur'),
    (93, 'Papua Selatan',             'timur'),
    (94, 'Papua Tengah',              'timur'),
    (95, 'Papua Pegunungan',          'timur'),
    (96, 'Papua Barat Daya',          'timur');

-- Aturan program. Disimpan sebagai DATA (bukan hardcode di aplikasi),
-- jadi kalau aturan berubah cukup UPDATE di pusat -> tersebar ke semua node.
INSERT INTO ref_program (kode, nama, basis, desil_maks, dasar_hukum) VALUES
    ('PKH',     'Program Keluarga Harapan',              'desil',    4,    'DTSEN (Inpres 4/2025); ketentuan 2026: desil 1-4'),
    ('BPNT',    'Bantuan Pangan Non Tunai (Sembako)',    'desil',    4,    'DTSEN; mulai 2026: desil 1-4'),
    ('PBI_JKN', 'Penerima Bantuan Iuran JKN',            'desil',    5,    'DTSEN; desil 1-5 atau asesmen'),
    ('MBG',     'Makan Bergizi Gratis',                  'kategori', NULL, 'Perpres 115/2025: peserta didik, balita 6-59 bulan, ibu hamil, ibu menyusui, pendidik & tenaga kependidikan');

-- Garis kemiskinan BPS Maret 2026 (dirilis 5 Agustus 2026).
-- Catatan: BPS mengukur kemiskinan dari PENGELUARAN per kapita, bukan penghasilan.
INSERT INTO ref_garis_kemiskinan (periode, wilayah, rupiah_per_kapita, sumber) VALUES
    ('2026-03', 'nasional',  669235, 'BPS, rilis 5 Agustus 2026'),
    ('2026-03', 'perkotaan', 692906, 'BPS, rilis 5 Agustus 2026'),
    ('2026-03', 'perdesaan', 635172, 'BPS, rilis 5 Agustus 2026');

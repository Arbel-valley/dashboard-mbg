# MBG-SBDT Starter

Starter proyek **Dashboard MBG / bansos** untuk mata kuliah Sistem Basis Data Terdistribusi.
Isinya cluster PostgreSQL terdistribusi (5 node) dan backend FastAPI yang sudah menunjukkan
unsur-unsur SBDT berikut:
- fragmentasi horizontal dan vertikal, serta alokasi;
- replikasi fisik dan logical;
- transparansi lokasi (postgres_fdw) dan query terdistribusi;
- katalog global;
- two-phase commit (2PC) beserta recovery-nya;
- perilaku sistem saat ada node yang mati.

> Semua data di sini **fiktif**. NIM dipakai sebagai pengganti NIK (NIM dummy berawalan `9`).

---

## 1. Arsitektur

```
                      Next.js (frontend, dibuat tim)
                                  |
                                  v
                     +--------------------------+
                     |  backend  (FastAPI)      |   koordinator 2PC
                     +--------------------------+
                        |                     |
                baca (lewat FDW)       tulis lintas node (2PC)
                        v                     |
   +----------------------------+   streaming |    +----------------------+
   | pusat (koordinator)        | ------------+--> | replica (hot standby)|
   | referensi, direktori NIM,  |             |    | read-only            |
   | log 2PC, tabel partisi FDW |             |    +----------------------+
   +----------------------------+             |
        | logical replication (referensi)     |
        | postgres_fdw (baca fragmen)         |
        v                                     v
+----------------+  +----------------+  +----------------+
| node-barat     |  | node-tengah    |  | node-timur     |
| prov 11-29     |  | prov 30-51     |  | prov 52-99     |
| Aceh s.d. Kepri|  | DKI s.d. Bali  |  | NTB s.d. Papua |
+----------------+  +----------------+  +----------------+
```

Topologinya terinspirasi tata kelola berjenjang di Perpres 115/2025 (BGN → KPPG → SPPG):
**pusat ≈ BGN/Kemensos**, **node ≈ kantor wilayah**.

### Peta konsep SBDT → file

| Konsep SBDT | Implementasi | File |
|---|---|---|
| Fragmentasi horizontal | `identitas` dipecah per range kode provinsi; tiap node menolak data provinsi milik node lain (CHECK) | `db/wilayah/init/03_fragmen.sh`, `db/pusat/init/04_fdw.sh` |
| Fragmentasi vertikal (jadi campuran) | `identitas` (data pribadi) terpisah dari `sosek` (sosial-ekonomi); role `ai_reader` hanya bisa membaca `sosek` | `db/wilayah/init/02_skema.sql` |
| Derived fragmentation | `sosek` & `klasifikasi` selalu ikut node pemilik `identitas` (FK komposit + `ON UPDATE CASCADE`) | `db/wilayah/init/02_skema.sql` |
| Skema alokasi | `ref_wilayah_node`: provinsi → node | `db/pusat/init/02_skema.sql`, `03_referensi.sql` |
| Transparansi lokasi | Di pusat, `identitas`/`sosek`/`klasifikasi` adalah tabel partisi yang partisinya foreign table di node | `db/pusat/init/04_fdw.sh` |
| Replikasi logical | Tabel referensi pusat → 3 node (publication/subscription) | `db/pusat/init/02_skema.sql`, `setup/setup.sh` |
| Replikasi fisik | Pusat → replica (streaming, hot standby) | `db/replica/entrypoint.sh` |
| Katalog global | `direktori_penduduk`: NIM → node, sekaligus menjamin NIM unik nasional | `db/pusat/init/02_skema.sql` |
| Query terdistribusi | Join + agregat dikerjakan di tiap node secara paralel (pushdown + async) | `db/pusat/init/04_fdw.sh`, `backend/app/main.py` |
| Agregat holistik | Desil nasional: skor lokal di node → cut-off global → ditulis atomik (2PC) | `backend/app/main.py` (`/desil/hitung`) |
| Transaksi terdistribusi | 2PC + log koordinator + recovery (*presumed abort*) | `backend/app/koordinator.py` |
| Ketersediaan | Node mati → wilayah lain tetap jalan, dashboard mode parsial, baca lewat replica | `backend/app/main.py` |

---

## 2. Prasyarat

- **Docker Desktop** (Windows: pakai backend WSL 2). Sisihkan RAM ±4 GB untuk Docker.
- Port kosong: **5440–5444** (database) dan **8000** (API). Bentrok? Salin `.env.example` jadi `.env` lalu ganti port-nya.
- Opsional: **DBeaver** untuk membuka 5 database sekaligus.

---

## 3. Menjalankan — langkah demi langkah (dengan verifikasi)

Semua perintah dijalankan dari folder proyek ini (PowerShell, CMD, maupun terminal Mac/Linux).

### Langkah 1 — Nyalakan cluster

```bash
docker compose up -d --build
docker compose ps
```

✅ **Verifikasi:** `pusat`, `replica`, `node-barat`, `node-tengah`, `node-timur` berstatus **healthy**,
`backend` **running**, dan `setup` **exited (0)**. Lihat log setup:

```bash
docker compose logs setup
```

Harus berakhir dengan:

```
== [2/3] Menunggu data referensi tersalin ==
   node-barat: referensi OK
   node-tengah: referensi OK
   node-timur: referensi OK
== [3/3] Uji FDW dari pusat ke 3 node ==
   identitas_barat | 0
   identitas_tengah | 0
   identitas_timur | 0
Setup selesai. ...
```

Buka **http://localhost:8000/docs** → Swagger UI harus tampil.

### Langkah 2 — Cek replikasi

```bash
docker compose exec pusat psql -U postgres -d mbg -f /verify/03_replikasi.sql
docker compose exec node-timur psql -U postgres -d mbg -f /verify/04_node.sql
docker compose exec replica psql -U postgres -d mbg -f /verify/06_replica.sql
```

✅ **Verifikasi:**
- Di pusat ada 4 koneksi replikasi berstatus `streaming`: 1 **fisik** (replica) dan 3 **logical** (`sub_ref_barat/tengah/timur`).
- Di node, tabel referensi terisi: wilayah **38**, program **4**, garis kemiskinan **3**.
- Uji disjointness di `04_node.sql` **ditolak** dengan pesan `violates check constraint "cek_fragmen_horizontal"` (memang harus begitu).
- Di replica: `standby = t`, `semua_wal_diterapkan = t`, dan INSERT ditolak (`read-only transaction`).

Uji propagasi aturan: ubah aturan di pusat, lalu lihat di node.

```bash
docker compose exec pusat psql -U postgres -d mbg -c "UPDATE ref_program SET desil_maks = 4 WHERE kode = 'PBI_JKN'"
docker compose exec node-barat psql -U postgres -d mbg -c "SELECT kode, desil_maks FROM ref_program"
# kembalikan:
docker compose exec pusat psql -U postgres -d mbg -c "UPDATE ref_program SET desil_maks = 5 WHERE kode = 'PBI_JKN'"
```

### Langkah 3 — Isi data dummy

```bash
docker compose exec backend python -m app.seed --jumlah 3000
```

✅ **Verifikasi:** muncul 13 batch berstatus `COMMIT`, masing-masing satu transaksi 2PC:

```
   barat  batch  1:  250 baris -> COMMIT (mbg-8cd9123d9c76)
   ...
Jumlah penduduk per node sekarang:
   barat : 638
   tengah: 1730
   timur : 632
```

Lalu buka **http://localhost:8000/status** → `cek_direktori_vs_fragmen` harus `OK` untuk ketiga node.
Isi ulang dari nol: `docker compose exec backend python -m app.seed --reset --jumlah 3000`.

### Langkah 4 — Verifikasi kebenaran fragmentasi

```bash
docker compose exec pusat psql -U postgres -d mbg -f /verify/01_fragmentasi.sql
docker compose exec node-barat psql -U ai_reader -d mbg -f /verify/05_hak_akses.sql
```

✅ **Verifikasi (tiga syarat benar fragmentasi):**
- **Completeness:** `lengkap = t`, artinya total baris semua fragmen sama dengan total di direktori.
- **Disjointness:** 0 baris NIM yang muncul di lebih dari satu fragmen.
- **Reconstruction:** jumlah `identitas`, `sosek`, dan hasil join-nya sama (3000/3000/3000).
- Fragmen barat berisi kode 11–21, tengah 31–51, timur 52–96.

Untuk `ai_reader`, SELECT dari `sosek` berhasil, sedangkan dari `identitas` harus `permission denied for table identitas`.

### Langkah 5 — Query terdistribusi

```bash
docker compose exec pusat psql -U postgres -d mbg -f /verify/02_query_terdistribusi.sql
```

✅ **Verifikasi:**
- Query dengan filter `kode_provinsi = 32` hanya memunculkan `Foreign Scan on identitas_tengah` (*partition pruning*).
- Query agregat memunculkan 3× `Async Foreign Scan` dengan
  `Relations: Aggregate on ((identitas_x) INNER JOIN (sosek_x))`. Artinya join **dan** GROUP BY dikerjakan
  di masing-masing node secara paralel, dan pusat hanya menerima hasil per provinsi.

> **Bahan laporan yang bagus:** tanpa opsi `use_remote_estimate 'true'` di server FDW, pushdown di atas
> **tidak terjadi**. postgres_fdw menaksir biaya join remote seolah *cross product* kedua tabel, sehingga
> optimizer memilih menarik semua baris ke pusat lalu join sendiri. Ini sudah diuji. Coba sendiri:
> `ALTER SERVER srv_barat OPTIONS (SET use_remote_estimate 'false');` lalu bandingkan EXPLAIN-nya.
> Pelajarannya: optimizer terdistribusi hanya sebagus estimasi biayanya.

Versi API: `GET /dashboard/explain`.

### Langkah 6 — Two-phase commit (lewat Swagger `/docs`)

Setiap respons 2PC memuat `jejak` (langkah per fase), yang cocok untuk ditampilkan saat presentasi.

| Skenario | Cara | Hasil yang diharapkan |
|---|---|---|
| Registrasi normal | `POST /penduduk` (contoh body sudah terisi) | **201** `COMMIT`; peserta `pusat` + node pemilik |
| NIM duplikat di wilayah lain | kirim NIM yang sama dengan `kode_provinsi` lain | **409**, ditolak direktori global; node tidak tersentuh |
| Peserta vote NO | `?simulasi=gagal_prepare` | **409** `ABORT`; peserta yang sudah PREPARE di-`ROLLBACK PREPARED` |
| Koordinator crash sebelum keputusan | `?simulasi=crash_sebelum_keputusan` | **202** `IN-DOUBT`; gid muncul di `pg_prepared_xacts` pusat & node (`/verify/07_2pc.sql`) |
| Blocking 2PC | daftarkan ulang NIM yang sama saat in-doubt | **423** setelah ±3 detik: baris terkunci transaksi yang menggantung |
| Recovery | tunggu ≥ 5 detik, lalu `POST /twopc/pulihkan` | `ROLLBACK PREPARED` karena log belum COMMIT (*presumed abort*) |
| Koordinator crash setelah keputusan | `?simulasi=crash_setelah_keputusan` | **202** `COMMIT-SEBAGIAN`; `/status` menunjukkan `BEDA`; pulihkan → `COMMIT PREPARED` → `OK` |
| Pindah domisili lintas node | `POST /penduduk/{nim}/pindah` ke provinsi di node lain | **200** `COMMIT` dengan 3 peserta: node asal, node tujuan, pusat |
| Desil nasional | `POST /desil/hitung` | 9 cut-off; tiap desil berisi ±10% penduduk (`GET /dashboard/desil`) |

`/twopc/pulihkan` sengaja melewati transaksi yang log-nya berubah < 5 detik lalu, karena mungkin masih berjalan.
Untuk demo cepat, pakai `?umur_min_detik=0`.

### Langkah 7 — Uji ketersediaan (demo yang disukai dosen)

**Matikan satu node:**

```bash
docker compose stop node-timur
```

| Coba | Hasil |
|---|---|
| `POST /penduduk` provinsi Papua (91) | **503** `ABORT`, dan direktori **tidak** berubah (atomisitas terjaga) |
| `POST /penduduk` provinsi Jawa Tengah (33) | **201** `COMMIT`; wilayah lain tetap bisa dilayani |
| `GET /penduduk?kode_provinsi=32` | **200**; pruning membuat node timur tidak ditanya |
| `GET /penduduk` tanpa filter | **503** (`could not connect to server "srv_timur"`): transparansi punya harga |
| `GET /dashboard/ringkasan` | **200** `mode: parsial`, `node_tidak_tersedia: ["timur"]` |
| `POST /desil/hitung` | **503**: desil adalah agregat holistik, jadi tidak bisa dihitung tanpa semua fragmen |
| `GET /status` | `timur.hidup = false` |

```bash
docker compose start node-timur
```

**Matikan pusat:**

```bash
docker compose stop pusat
```

| Coba | Hasil |
|---|---|
| `GET /penduduk/{nim}` | **200**, `direktori_dibaca_dari: replica` |
| `GET /dashboard/ringkasan` | **200** `mode: global` lewat replica (FDW replica langsung ke node) |
| `POST /penduduk` | **503**, karena pusat (direktori) adalah peserta wajib |
| `POST /twopc/pulihkan` | **503**: tanpa log koordinator, tidak aman memutuskan nasib transaksi in-doubt |

```bash
docker compose start pusat
```

Replica dan ketiga subscription akan tersambung kembali sendiri. Cek di `/status`.

---

## 4. Endpoint API

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/status` | Status 5 node, replikasi, subscription, transaksi in-doubt, cek direktori vs fragmen |
| GET | `/penduduk?kode_provinsi=&limit=` | Daftar via tabel partisi (transparansi lokasi); kolom `fragmen` menunjukkan asal node |
| GET | `/penduduk/{nim}` | Cari lokasi di direktori global, lalu baca langsung ke node pemilik |
| POST | `/penduduk?simulasi=` | Registrasi (2PC pusat + node) |
| POST | `/penduduk/{nim}/pindah?simulasi=` | Pindah domisili (2PC 2–3 peserta) |
| POST | `/desil/hitung?simulasi=` | Penetapan desil nasional (2PC 3 node) |
| GET | `/dashboard/ringkasan` | Per provinsi: jumlah penduduk, penghasilan per kapita, di bawah garis kemiskinan, sasaran MBG |
| GET | `/dashboard/desil` | Distribusi desil + jumlah layak per program (aturan dari `ref_program`) |
| GET | `/dashboard/explain` | EXPLAIN query ringkasan (bukti pushdown) |
| POST | `/twopc/pulihkan?umur_min_detik=` | Recovery transaksi in-doubt |
| GET | `/twopc/log` | Log koordinator 2PC |

CORS sudah mengizinkan `http://localhost:3000` (Next.js dev). Contoh dari frontend: `fetch("http://localhost:8000/status")`.

## 5. Koneksi DBeaver

| Node | Host | Port | Database | User / password |
|---|---|---|---|---|
| pusat | localhost | 5440 | mbg | `postgres` / `postgres_dev_123` |
| replica | localhost | 5441 | mbg | `postgres` / `postgres_dev_123` |
| node-barat | localhost | 5442 | mbg | `postgres` / `postgres_dev_123` |
| node-tengah | localhost | 5443 | mbg | `postgres` / `postgres_dev_123` |
| node-timur | localhost | 5444 | mbg | `postgres` / `postgres_dev_123` |

Role lain: `app_user` (backend), `fdw_user` (pusat → node, **hanya SELECT**), `ai_reader` (hanya `sosek`), `replicator`.

---

## 6. Catatan penting (baca sebelum presentasi)

- **Status pengujian.** Semua SQL, init script, setup, replikasi, backend, dan semua skenario di atas sudah diuji
  end-to-end di PostgreSQL 16, dengan init script yang persis sama (jaringan Docker ditiru pakai IP loopback).
  `docker-compose.yml` sudah divalidasi secara statis, tapi **belum dijalankan di Docker sungguhan**.
  Langkah verifikasi di bagian 3 dibuat supaya kalian bisa memastikannya sendiri; target image-nya `postgres:17`.
- **Kenapa psycopg langsung, bukan SQLAlchemy?** Supaya tiap fase 2PC (`PREPARE TRANSACTION`, `COMMIT PREPARED`)
  terlihat jelas di kode `koordinator.py`. Konsepnya sama dengan `begin_twophase()` di SQLAlchemy.
- **Data dummy tidak dikalibrasi** ke statistik resmi. Sekitar 16% penduduk dummy di bawah garis kemiskinan,
  sedangkan BPS Maret 2026 mencatat 8,07%. Tiap baris = satu individu yang membawa data sosek rumah tangganya;
  di DTSEN asli, peringkat dihitung per **keluarga**.
- **Skor `rule_v1` hanya baseline**, bukan model AI. Tim AI tinggal menggantinya dan membandingkan hasilnya.
- **Garis kemiskinan** memakai data BPS Maret 2026 (Rp669.235 nasional; Rp692.906 perkotaan; Rp635.172 perdesaan).
  Perlu dicatat, BPS mengukur kemiskinan dari **pengeluaran**, bukan penghasilan.
- **Password di sini khusus dev.** Mengganti password di `.env` setelah volume terbentuk **tidak** mengubah role
  yang sudah ada. Harus `docker compose down -v` dulu (data hilang).
- **Init script hanya jalan saat volume kosong.** Mengubah file di `db/` → `docker compose down -v` lalu `up -d` lagi.

## 7. Troubleshooting

| Gejala | Penyebab & solusi |
|---|---|
| `port is already allocated` | Port dipakai aplikasi lain (mis. PostgreSQL lokal). Ganti `PORT_*` di `.env`. |
| `setup` exit 1 | `docker compose logs setup`, lalu `docker compose logs pusat node-barat`. |
| `$'\r': command not found` / `bad interpreter` | File `.sh` berakhiran baris CRLF (Windows). `.gitattributes` sudah mencegahnya untuk clone baru. Kalau sudah terlanjur, ubah ke **LF** di VS Code (pojok kanan bawah), lalu `down -v` + `up -d`. |
| Replica restart terus: `insufficient parameter settings` | `max_prepared_transactions` replica lebih kecil dari pusat. Samakan di `docker-compose.yml`. |
| `prepared transactions are disabled` | `max_prepared_transactions` masih 0 di node itu. |
| 423 terus saat registrasi | Ada transaksi in-doubt. `POST /twopc/pulihkan`. |
| Backend tidak auto-reload setelah edit kode (Windows) | `docker compose restart backend`. |
| Ingin mulai dari nol | `docker compose down -v` lalu `docker compose up -d --build`. |

## 8. Latihan lanjutan untuk tim

1. **Kuota program (2PC):** tabel `kuota_program` di pusat; menetapkan penerima = UPDATE status di node + potong kuota di pusat, dalam satu transaksi 2PC.
2. **Model AI:** latih model dari `sosek` (login sebagai `ai_reader`), bandingkan dengan `hitung_skor` (`rule_v1`), simpan hasilnya dengan `metode` baru.
3. **Halaman Status Cluster** di Next.js dari `GET /status`.
4. **Failover manual:** `docker compose exec replica psql -U postgres -c "SELECT pg_promote()"`. Diskusikan apa yang terjadi pada pusat lama dan subscription node.
5. **Uji performa:** bandingkan waktu query dashboard terdistribusi vs satu database terpusat (k6 / `\timing`).

## 9. Struktur folder

```
docker-compose.yml        cluster 5 node + setup + backend
db/pusat/init/            init pusat: role, skema, referensi, FDW + tabel partisi
db/wilayah/init/          init node wilayah (dipakai bersama 3 node, beda di env)
db/replica/entrypoint.sh  pg_basebackup -> hot standby
setup/setup.sh            membuat subscription logical replication
verify/                   skrip SQL verifikasi tiap tahap
backend/app/              FastAPI: koordinator 2PC, endpoint, seeder
```

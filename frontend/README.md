# Dasbor MBG — Frontend

Frontend untuk starter `mbg-sbdt`. Dibangun dengan Next.js 16, TypeScript, Tailwind CSS 4, SWR, dan Recharts.

Setiap halaman sengaja memperlihatkan konsep basis data terdistribusi yang biasanya tidak kelihatan: data ini
disimpan di node mana, dibaca dari mana, dan apa yang terjadi saat ada node yang mati.

---

## 1. Cara frontend terhubung ke backend

```
Browser  ──►  Next.js (localhost:3000/api/...)  ──►  FastAPI (API_URL, mis. localhost:8001)
```

Browser **tidak pernah** memanggil FastAPI secara langsung. Semua request ke `/api/*` diteruskan oleh server
Next.js (fitur *rewrite* di `next.config.ts`). Analoginya resepsionis: tamu cukup bicara ke resepsionis, dan
resepsionis yang meneruskan ke ruangan yang tepat.

Akibatnya:
- **Tidak ada masalah CORS**, karena dari sudut pandang browser semua request ke origin yang sama.
- **Alamat backend cukup diatur di satu tempat:** `API_URL` di `.env.local`.

---

## 2. Menjalankan (dengan verifikasi tiap langkah)

**Prasyarat:** Node.js **20.9 atau lebih baru** (`node -v`), dan cluster backend sudah jalan (`docker compose ps`
di folder backend: semua healthy).

### Langkah 1 — Perbarui backend

Frontend butuh endpoint `GET /referensi/wilayah` (daftar 38 provinsi + node penyimpannya). Ganti file
`backend/app/main.py` di folder starter dengan versi terbaru, lalu:

```bash
docker compose restart backend
```

✅ Buka `http://localhost:8001/referensi/wilayah` (sesuaikan port backend-mu) → harus muncul 38 provinsi.

### Langkah 2 — Pasang dependensi

```bash
npm install
```

### Langkah 3 — Arahkan ke backend

PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Mac/Linux: `cp .env.example .env.local`. Lalu buka `.env.local` dan sesuaikan port-nya:

```
API_URL=http://localhost:8001
```

### Langkah 4 — Jalankan

```bash
npm run dev
```

✅ Buka **http://localhost:3000**. Strip di bagian atas harus menampilkan tiga segmen berwarna (Barat, Tengah,
Timur) beserta jumlah penduduknya. Cek juga **http://localhost:3000/api/status**, yang harus mengembalikan JSON
status cluster. Kalau keduanya sesuai, jalur Browser → Next.js → FastAPI sudah tersambung.

---

## 3. Halaman dan konsep SBDT yang ditunjukkan

| Halaman | Yang ditunjukkan |
|---|---|
| **Strip Nusantara** (di atas setiap halaman) | Tiga node wilayah berjajar barat → timur, lebarnya sebanding jumlah data. Node mati tampil diarsir merah; transaksi 2PC yang menggantung muncul sebagai penanda ungu. Diperbarui tiap 5 detik. |
| **Ringkasan** (`/`) | Agregat dari tiga node sekaligus. Kalau satu node mati, muncul banner "Data belum lengkap" (mode parsial), dan angkanya otomatis hanya mencakup node yang hidup. |
| **Penduduk** (`/penduduk`) | Transparansi lokasi: satu tabel, tapi kolom "Tersimpan di" menunjukkan fragmen asal. Saring per provinsi → muncul penjelasan *partition pruning*. |
| **Detail** (`/penduduk/[nim]`) | Jalur baca: direktori global di pusat → node pemilik. Form pindah domisili menjalankan 2PC dengan 2 atau 3 peserta. |
| **Registrasi** (`/registrasi`) | 2PC pusat + node wilayah, lengkap dengan jejak langkah per fase. Ada pilihan mode gangguan (vote NO, koordinator mati). |
| **Desil & program** (`/desil`) | Agregat holistik: desil nasional dihitung dari skor ketiga node. Warna grafik diturunkan dari aturan program di database. |
| **Status cluster** (`/cluster`) | Kondisi lima database, konsistensi direktori vs fragmen, replikasi fisik & logical, pemulihan transaksi menggantung, log koordinator, dan bukti EXPLAIN pushdown. |

---

## 4. Saran alur demo (±6 menit)

1. **Ringkasan.** Tunjukkan strip Nusantara dan tabel provinsi yang warnanya mengikuti node.
2. **Penduduk.** Saring satu provinsi, bacakan kalimat soal partition pruning, lalu klik satu baris untuk
   menunjukkan jalur baca "direktori → node".
3. **Registrasi normal.** Klik **Isi data contoh** → **Daftarkan**. Bacakan jejak 10 langkahnya (fase 1, keputusan,
   fase 2).
4. **Koordinator mati.** Ulangi dengan mode **Koordinator mati sebelum memutuskan**. Strip menampilkan "2 transaksi
   menggantung". Buka **Status cluster** → **Pulihkan**, lalu jelaskan kenapa hasilnya ROLLBACK (log belum mencatat
   COMMIT → *presumed abort*).
5. **Node mati.** Di terminal backend jalankan `docker compose stop node-timur`. Dalam 5 detik strip timur berubah
   jadi arsiran merah, dan Ringkasan menampilkan "Data belum lengkap". Lalu `docker compose start node-timur`.
6. **Status cluster** → buka **Bukti query terdistribusi (EXPLAIN)**, tunjukkan baris `Async Foreign Scan`.

---

## 5. Struktur folder

```
src/app/                 halaman (App Router): /, /penduduk, /penduduk/[nim], /registrasi, /desil, /cluster
src/components/          komponen aplikasi: strip Nusantara, jejak 2PC, error state, dll.
src/components/ui/       komponen dasar pola shadcn/ui (cva + cn)
src/lib/api.ts           klien API: memanggil /api/*, menerjemahkan 4 bentuk error backend
src/lib/types.ts         tipe respons, ditulis mengikuti JSON asli setiap endpoint
next.config.ts           rewrite /api/* → API_URL
```

Mau menambah komponen shadcn? `components.json` dan variabel tema sudah disiapkan:
`npx shadcn@latest add dialog`.

---

## 6. Troubleshooting

| Gejala | Penyebab & solusi |
|---|---|
| Strip bergaris putus-putus "Status tidak diketahui" + "Backend tidak menjawab" | Next.js tidak bisa menjangkau FastAPI. Cek `docker compose ps` dan `API_URL` di `.env.local`. **Setelah mengubah `.env.local`, hentikan dan jalankan ulang `npm run dev`**, karena rewrite hanya dibaca saat start. |
| "Backend belum punya endpoint /referensi/wilayah" | Langkah 1 belum dilakukan. |
| Port 3000 sudah dipakai | `npm run dev -- -p 3001`. Tidak perlu mengubah CORS, karena request lewat proxy. |
| Registrasi gagal HTTP 423 | Ada transaksi menggantung yang mengunci data. Pulihkan di **Status cluster**. |
| Halaman desil kosong | Desil belum pernah dihitung. Tekan **Hitung desil nasional**. |

## 7. Status pengujian

Sudah diuji di sandbox terhadap backend dan cluster yang sama (PostgreSQL 16): `tsc`, `eslint`, dan `next build`
bersih. Uji browser (Chromium headless) mencakup render kelima halaman tanpa error console, registrasi normal,
registrasi dengan koordinator mati lalu dipulihkan dari halaman cluster, node timur dimatikan, backend dimatikan,
dan tampilan mobile 390px. Yang belum: dijalankan di Windows dan di Docker PostgreSQL 17 milik kalian.

"""
Generator data dummy penduduk — NIM sebagai pengganti NIK. SEMUA DATA FIKTIF.

Pemakaian (dari folder proyek):
    docker compose exec backend python -m app.seed --jumlah 3000
    docker compose exec backend python -m app.seed --reset --jumlah 3000

Setiap batch ditulis dengan 2PC: pusat (direktori) + node pemilik (identitas + sosek).
Catatan penyederhanaan: tiap baris = satu individu yang membawa data sosek
rumah tangganya. Di DTSEN asli, peringkat kesejahteraan dihitung per keluarga.
"""
from __future__ import annotations

import argparse
import math
import random
import sys
from collections import defaultdict
from datetime import date, timedelta
from typing import Any

from faker import Faker

from .config import NODE_WILAYAH
from .db import insert_banyak, sambung
from .koordinator import Transaksi2PC, TransaksiGagal

# Bobot kasar per provinsi (kira-kira juta jiwa) supaya sebaran dummy tidak rata.
# Hanya untuk simulasi — BUKAN data resmi.
BOBOT_PROVINSI: dict[int, float] = {
    11: 5.6, 12: 15.6, 13: 5.8, 14: 7.0, 15: 3.7, 16: 8.8, 17: 2.1, 18: 9.4, 19: 1.5, 21: 2.2,
    31: 10.7, 32: 50.3, 33: 37.9, 34: 3.8, 35: 41.8, 36: 12.6, 51: 4.5,
    52: 5.7, 53: 5.7, 61: 5.6, 62: 2.8, 63: 4.2, 64: 4.0, 65: 0.7,
    71: 2.7, 72: 3.1, 73: 9.4, 74: 2.8, 75: 1.2, 76: 1.5, 81: 1.9, 82: 1.4,
    91: 1.1, 92: 0.6, 93: 0.5, 94: 1.4, 95: 1.5, 96: 0.6,
}

# (pekerjaan kepala keluarga, bobot, pengali penghasilan)
PEKERJAAN: list[tuple[str, int, float]] = [
    ("tidak_bekerja", 6, 0.35),
    ("buruh_tani", 10, 0.55),
    ("petani", 14, 0.75),
    ("nelayan", 4, 0.80),
    ("buruh_bangunan", 8, 0.80),
    ("pedagang", 16, 1.05),
    ("wiraswasta", 12, 1.30),
    ("karyawan_swasta", 22, 1.35),
    ("pns_tni_polri", 8, 1.80),
]
PENDIDIKAN = ["tidak_sekolah", "sd", "smp", "sma", "diploma", "sarjana"]


def _peluang_kota(kode: int) -> float:
    if kode == 31:
        return 1.0
    if kode in (21, 32, 33, 34, 35, 36, 51):
        return 0.65
    if kode in (12, 16, 64):
        return 0.5
    if kode in (93, 94, 95):
        return 0.2
    return 0.4


def _nim_baru(rng: random.Random, terpakai: set[str]) -> str:
    while True:
        nim = "9" + "".join(rng.choices("0123456789", k=10))  # awalan 9 = penanda data dummy
        if nim not in terpakai:
            terpakai.add(nim)
            return nim


def _kategori_mbg(rng: random.Random, jk: str, umur_hari: int) -> list[str]:
    umur_bulan, umur = umur_hari // 30, umur_hari // 365
    kategori = []
    if 6 <= umur_bulan <= 59:
        kategori.append("balita")
    if 5 <= umur <= 18 and rng.random() < 0.9:
        kategori.append("peserta_didik")
    if jk == "P" and 18 <= umur <= 42:
        r = rng.random()
        if r < 0.06:
            kategori.append("ibu_hamil")
        elif r < 0.14:
            kategori.append("ibu_menyusui")
    if 22 <= umur <= 60 and rng.random() < 0.04:
        kategori.append("pendidik")
    return kategori


def _sosek(rng: random.Random, kota: bool) -> dict[str, Any]:
    art = rng.choices(range(1, 9), weights=[5, 10, 18, 24, 20, 12, 7, 4])[0]
    pekerjaan, _, pengali = rng.choices(PEKERJAAN, weights=[p[1] for p in PEKERJAAN])[0]
    median = 7_500_000 if kota else 5_000_000  # tidak dikalibrasi ke statistik resmi (lihat README)
    penghasilan = int(max(300_000, rng.lognormvariate(math.log(median * pengali), 0.55)) // 1000 * 1000)

    # Atribut rumah & aset dibuat berkorelasi dengan kemampuan ekonomi,
    # supaya nanti model AI punya "sinyal" untuk dipelajari.
    rasio = (penghasilan / art) / 650_000
    if pengali >= 1.3:
        bobot_pend = [1, 4, 8, 30, 15, 25]
    elif pengali >= 1.0:
        bobot_pend = [3, 15, 20, 35, 8, 8]
    else:
        bobot_pend = [12, 40, 25, 18, 2, 1]
    return {
        "penghasilan_bulanan": penghasilan,
        "jumlah_art": art,
        "pekerjaan_kk": pekerjaan,
        "pendidikan_kk": rng.choices(PENDIDIKAN, weights=bobot_pend)[0],
        "luas_lantai_m2": round(art * rng.uniform(5, 10 + 6 * min(rasio, 3)), 1),
        "jenis_lantai": rng.choices(["tanah", "semen", "keramik"],
                                    weights=[max(0.1, 1.4 - rasio), 1.0, 0.3 + rasio])[0],
        "sumber_air": rng.choices(
            ["sungai", "sumur_tak_terlindung", "sumur_terlindung", "pdam", "air_kemasan"],
            weights=[max(0.05, 0.5 - 0.2 * rasio), max(0.05, 0.8 - 0.25 * rasio), 1.2,
                     (0.4 + 0.4 * rasio) if kota else (0.2 + 0.2 * rasio), 0.3 + 0.4 * rasio],
        )[0],
        "daya_listrik_va": rng.choices([450, 900, 1300, 2200, 3500],
                                       weights=[max(0.1, 1.4 - rasio), 1.5, 0.5 + 0.4 * rasio,
                                                0.15 + 0.35 * rasio, 0.05 + 0.25 * rasio])[0],
        "punya_motor": rng.random() < min(0.95, 0.35 + 0.30 * rasio),
        "punya_mobil": rng.random() < min(0.80, 0.01 + 0.07 * rasio ** 1.5),
        "punya_lahan": rng.random() < (0.15 if kota else 0.45),
    }


def _reset() -> None:
    print("Reset: hapus semua data penduduk (2PC ke pusat + 3 node)...")
    with Transaksi2PC("reset") as tx:
        tx.peserta("pusat").execute("DELETE FROM direktori_penduduk")
        for node in NODE_WILAYAH:
            tx.peserta(node).execute("DELETE FROM identitas")  # sosek & klasifikasi ikut (ON DELETE CASCADE)
        hasil = tx.selesaikan()
    print(f"   reset -> {hasil['status']} ({hasil['gid']})")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Isi data dummy penduduk ke cluster (via 2PC)")
    ap.add_argument("--jumlah", type=int, default=3000, help="jumlah penduduk (default 3000)")
    ap.add_argument("--batch", type=int, default=250, help="baris per transaksi 2PC (default 250)")
    ap.add_argument("--seed", type=int, default=42, help="seed acak supaya hasil bisa diulang")
    ap.add_argument("--reset", action="store_true", help="hapus semua data penduduk dulu")
    args = ap.parse_args(argv)

    # Prasyarat: referensi sudah tersalin ke semua node (FK identitas -> ref_wilayah_node)
    for node in NODE_WILAYAH:
        with sambung(node, autocommit=True) as c:
            if c.execute("SELECT count(*) AS n FROM ref_wilayah_node").fetchone()["n"] == 0:
                print(f"[!] ref_wilayah_node di node {node} masih kosong. Cek: docker compose logs setup")
                return 1

    if args.reset:
        _reset()

    with sambung("pusat", autocommit=True) as c:
        provinsi = c.execute(
            "SELECT kode_provinsi, nama_provinsi, node FROM ref_wilayah_node ORDER BY kode_provinsi"
        ).fetchall()
        terpakai = {r["nim"] for r in c.execute("SELECT nim FROM direktori_penduduk").fetchall()}

    rng = random.Random(args.seed)
    fake = Faker("id_ID")
    fake.seed_instance(args.seed)
    info = {p["kode_provinsi"]: p for p in provinsi}
    kode_list = list(info)
    bobot = [BOBOT_PROVINSI.get(k, 1.0) for k in kode_list]

    per_node: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for _ in range(args.jumlah):
        kode = rng.choices(kode_list, weights=bobot)[0]
        prov = info[kode]
        jk = rng.choice("LP")
        umur_hari = rng.randint(180, 75 * 365)
        nim = _nim_baru(rng, terpakai)
        kota = rng.random() < _peluang_kota(kode)
        per_node[prov["node"]].append({
            "direktori": {"nim": nim, "node": prov["node"], "kode_provinsi": kode},
            "identitas": {
                "nim": nim,
                # nama depan + belakang saja (name_male()/name_female() kadang memberi gelar, mis. "drg. ..., S.H.")
                "nama": (f"{fake.first_name_male()} {fake.last_name_male()}" if jk == "L"
                         else f"{fake.first_name_female()} {fake.last_name_female()}"),
                "jenis_kelamin": jk,
                "tanggal_lahir": date.today() - timedelta(days=umur_hari),
                "alamat": f"{fake.street_address()}, {prov['nama_provinsi']}",
                "kode_provinsi": kode,
                "kategori_mbg": _kategori_mbg(rng, jk, umur_hari),
            },
            "sosek": {"nim": nim, "kode_provinsi": kode, "perkotaan": kota, **_sosek(rng, kota)},
        })

    print(f"Menulis {args.jumlah} penduduk dummy (batch {args.batch}, tiap batch = 1 transaksi 2PC)...")
    for node in NODE_WILAYAH:
        daftar = per_node.get(node, [])
        for i in range(0, len(daftar), args.batch):
            batch = daftar[i:i + args.batch]
            try:
                with Transaksi2PC("seed") as tx:
                    insert_banyak(tx.peserta("pusat"), "direktori_penduduk", [b["direktori"] for b in batch])
                    insert_banyak(tx.peserta(node), "identitas", [b["identitas"] for b in batch])
                    insert_banyak(tx.peserta(node), "sosek", [b["sosek"] for b in batch])
                    hasil = tx.selesaikan()
            except TransaksiGagal as e:
                print(f"[!] {node} batch {i // args.batch + 1} gagal: {e.pesan} — {e.penyebab}")
                return 1
            print(f"   {node:<6} batch {i // args.batch + 1:>2}: {len(batch):>4} baris -> "
                  f"{hasil['status']} ({hasil['gid']})")

    print("\nJumlah penduduk per node sekarang:")
    for node in NODE_WILAYAH:
        with sambung(node, autocommit=True) as c:
            n = c.execute("SELECT count(*) AS n FROM identitas").fetchone()["n"]
        print(f"   {node:<6}: {n}")
    print("\nLanjut: POST /desil/hitung (Swagger: http://localhost:8000/docs) untuk menetapkan desil nasional.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

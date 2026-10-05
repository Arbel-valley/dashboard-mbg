"""
MBG-SBDT Starter — API FastAPI.
Buka http://localhost:8000/docs untuk mencoba semua endpoint (Swagger UI).
"""
from __future__ import annotations

import statistics
from typing import Any, Literal

import psycopg
from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from psycopg import errors as pgerr

from .config import CORS_ORIGINS, NODE_WILAYAH
from .db import insert_satu, sambung
from .koordinator import Transaksi2PC, TransaksiGagal, pulihkan, ringkas
from .skema import PendudukIn, PindahIn, Simulasi

NodeParam = Literal["barat", "tengah", "timur"]

app = FastAPI(
    title="MBG-SBDT Starter API",
    version="0.1.0",
    description=(
        "Dashboard penerima MBG/bansos di atas database terdistribusi: fragmentasi horizontal & "
        "vertikal, replikasi, postgres_fdw (transparansi lokasi), dan two-phase commit."
    ),
)
# Catatan: kolom numeric di-cast ke bigint/float8 di SQL, karena Decimal akan
# diserialisasi sebagai STRING oleh Pydantic v2 (merepotkan frontend).
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])


# =====================================================================
# Error database -> respons HTTP yang jelas
# =====================================================================
def _klasifikasi_error(e: BaseException | None) -> tuple[int, str]:
    if isinstance(e, pgerr.UniqueViolation):
        return 409, "Data duplikat. Untuk NIM: ditolak direktori global di pusat (NIM wajib unik secara nasional)."
    if isinstance(e, pgerr.LockNotAvailable):
        return 423, "Data terkunci oleh transaksi 2PC yang menggantung (in-doubt). Jalankan POST /twopc/pulihkan."
    if isinstance(e, (pgerr.CheckViolation, pgerr.ForeignKeyViolation, pgerr.NotNullViolation)):
        return 422, "Data melanggar constraint di node."
    if isinstance(e, psycopg.OperationalError):
        return 503, "Ada node yang tidak bisa dihubungi."
    if isinstance(e, RuntimeError):
        return 409, "Transaksi dibatalkan (ABORT)."
    return 500, "Error tak terduga."


@app.exception_handler(TransaksiGagal)
async def _tangani_transaksi_gagal(request: Request, exc: TransaksiGagal) -> JSONResponse:
    kode, jenis = _klasifikasi_error(exc.penyebab)
    return JSONResponse(
        status_code=kode,
        content={
            "status": "ABORT",
            "gid": exc.gid,
            "pesan": exc.pesan,
            "jenis": jenis,
            "detail": ringkas(exc.penyebab),
            "jejak": exc.jejak,
        },
    )


@app.exception_handler(psycopg.Error)
async def _tangani_psycopg(request: Request, exc: psycopg.Error) -> JSONResponse:
    kode, jenis = _klasifikasi_error(exc)
    return JSONResponse(status_code=kode, content={"pesan": jenis, "detail": ringkas(exc)})


# =====================================================================
# Helper
# =====================================================================
def _alokasi(kode_provinsi: int) -> tuple[str, str]:
    """Skema ALOKASI: provinsi -> node (dibaca dari ref_wilayah_node di pusat)."""
    with sambung("pusat", autocommit=True) as c:
        r = c.execute(
            "SELECT node, nama_provinsi FROM ref_wilayah_node WHERE kode_provinsi = %s", (kode_provinsi,)
        ).fetchone()
    if r is None:
        raise HTTPException(422, f"Kode provinsi {kode_provinsi} tidak ada di ref_wilayah_node")
    return r["node"], r["nama_provinsi"]


def _baca_dari(urutan: tuple[str, ...], query: str, params: Any = None) -> tuple[list[dict[str, Any]], str]:
    """Jalankan query BACA di sumber pertama yang hidup (mis. replica -> pusat)."""
    alasan = []
    for sumber in urutan:
        try:
            with sambung(sumber, autocommit=True) as c:
                return c.execute(query, params).fetchall(), sumber
        except psycopg.OperationalError as e:
            alasan.append(f"{sumber}: {ringkas(e)}")
    raise HTTPException(503, {"pesan": "Semua sumber data tidak bisa dihubungi", "detail": alasan})


def _garis_kemiskinan(c: psycopg.Connection) -> dict[str, int]:
    rows = c.execute(
        "SELECT wilayah, rupiah_per_kapita FROM ref_garis_kemiskinan "
        "WHERE periode = (SELECT max(periode) FROM ref_garis_kemiskinan)"
    ).fetchall()
    gk = {r["wilayah"]: r["rupiah_per_kapita"] for r in rows}
    if "perkotaan" not in gk or "perdesaan" not in gk:
        raise HTTPException(409, "ref_garis_kemiskinan belum lengkap (cek replikasi referensi)")
    return {"gk_kota": gk["perkotaan"], "gk_desa": gk["perdesaan"]}


def _kode_http(hasil: dict[str, Any], response: Response) -> None:
    """COMMIT penuh -> kode sukses biasa; IN-DOUBT / COMMIT-SEBAGIAN / COMMIT-TERTUNDA -> 202 (belum tuntas)."""
    if hasil.get("status") != "COMMIT":
        response.status_code = 202


# =====================================================================
# Info & status cluster
# =====================================================================
@app.get("/", tags=["info"])
def info() -> dict[str, Any]:
    return {
        "nama": "MBG-SBDT Starter API",
        "dokumentasi": "/docs",
        "status_cluster": "/status",
        "referensi_wilayah": "/referensi/wilayah",
        "node": ["pusat", "replica", *NODE_WILAYAH],
    }


@app.get("/status", tags=["cluster"], summary="Status semua node (bahan halaman Status Cluster)")
def status_cluster() -> dict[str, Any]:
    hasil: dict[str, Any] = {}
    for node in ("pusat", "replica", *NODE_WILAYAH):
        info: dict[str, Any] = {"hidup": False}
        try:
            with sambung(node, autocommit=True) as c:
                info["hidup"] = True
                info["standby"] = c.execute("SELECT pg_is_in_recovery() AS v").fetchone()["v"]
                info["prepared_xacts"] = [
                    r["gid"] for r in c.execute(
                        "SELECT gid FROM pg_prepared_xacts WHERE database = current_database() ORDER BY prepared"
                    ).fetchall()
                ]
                if node in ("pusat", "replica"):
                    info["direktori_per_node"] = {
                        r["node"]: r["n"] for r in c.execute(
                            "SELECT node, count(*) AS n FROM direktori_penduduk GROUP BY node ORDER BY node"
                        ).fetchall()
                    }
                if node == "pusat":
                    # Walsender fisik tidak terikat database; walsender logical terikat database.
                    info["replikasi"] = c.execute(
                        "SELECT r.application_name, "
                        "CASE WHEN a.datname IS NULL THEN 'fisik (replica)' ELSE 'logical (referensi)' END AS jenis, "
                        "r.state, r.replay_lag::text AS replay_lag "
                        "FROM pg_stat_replication r JOIN pg_stat_activity a USING (pid) "
                        "ORDER BY jenis, r.application_name"
                    ).fetchall()
                    info["slot_logical"] = c.execute(
                        "SELECT slot_name, active FROM pg_replication_slots "
                        "WHERE slot_type = 'logical' ORDER BY slot_name"
                    ).fetchall()
                if node == "replica":
                    # Bandingkan posisi WAL (bukan selisih waktu): selisih waktu terus membesar
                    # saat pusat idle walaupun replica sebenarnya sudah sinkron penuh.
                    info["sinkron"] = c.execute(
                        "SELECT pg_last_wal_receive_lsn() = pg_last_wal_replay_lsn() AS semua_wal_diterapkan, "
                        "pg_last_xact_replay_timestamp()::text AS transaksi_terakhir_diterapkan"
                    ).fetchone()
                if node in NODE_WILAYAH:
                    info["fragmen"] = c.execute("SELECT nama, prov_min, prov_max FROM info_node").fetchone()
                    info["jumlah"] = c.execute(
                        "SELECT (SELECT count(*) FROM identitas) AS identitas, "
                        "(SELECT count(*) FROM sosek) AS sosek, "
                        "(SELECT count(*) FROM klasifikasi) AS klasifikasi"
                    ).fetchone()
                    info["referensi"] = c.execute(
                        "SELECT (SELECT count(*) FROM ref_wilayah_node) AS wilayah, "
                        "(SELECT count(*) FROM ref_program) AS program, "
                        "(SELECT count(*) FROM ref_garis_kemiskinan) AS garis_kemiskinan"
                    ).fetchone()
                    info["subscription"] = c.execute(
                        "SELECT subname, pid IS NOT NULL AS worker_aktif, "
                        "latest_end_time::text AS terakhir_sinkron "
                        "FROM pg_stat_subscription WHERE relid IS NULL"
                    ).fetchall()
        except psycopg.Error as e:
            info["error"] = ringkas(e)
        hasil[node] = info

    # Cek cepat COMPLETENESS: jumlah per node menurut direktori == jumlah baris di node
    direktori = hasil["pusat"].get("direktori_per_node") or hasil["replica"].get("direktori_per_node")
    if direktori is not None:
        cek = {}
        for node in NODE_WILAYAH:
            jumlah = hasil[node].get("jumlah")
            if jumlah is None:
                cek[node] = "node tidak bisa dihubungi"
            elif jumlah["identitas"] == direktori.get(node, 0):
                cek[node] = "OK"
            else:
                cek[node] = f"BEDA: direktori {direktori.get(node, 0)} vs node {jumlah['identitas']}"
        hasil["cek_direktori_vs_fragmen"] = cek
    return hasil


# =====================================================================
# Referensi
# =====================================================================
@app.get("/referensi/wilayah", tags=["referensi"],
         summary="38 provinsi beserta node penyimpannya (skema alokasi, dibaca dari database)")
def referensi_wilayah() -> dict[str, Any]:
    baris, sumber = _baca_dari(
        ("replica", "pusat"),
        "SELECT kode_provinsi, nama_provinsi, node FROM ref_wilayah_node ORDER BY kode_provinsi",
    )
    return {"dibaca_dari": sumber, "baris": baris}

# =====================================================================
# Penduduk — BACA
# =====================================================================
def _kode_node(node: str) -> list[int]:
    """Skema alokasi: node -> daftar kode provinsinya (dibaca dari ref_wilayah_node)."""
    baris, _ = _baca_dari(
        ("replica", "pusat"), "SELECT kode_provinsi FROM ref_wilayah_node WHERE node = %s ORDER BY 1", (node,)
    )
    return [r["kode_provinsi"] for r in baris]


@app.get("/penduduk", tags=["penduduk"],
         summary="Daftar penduduk lewat tabel partisi (transparansi lokasi), dengan halaman, pencarian & filter node")
def daftar_penduduk(
    kode_provinsi: int | None = None,
    node: NodeParam | None = None,
    q: str | None = Query(None, max_length=60, description="Cari sebagian nama atau awalan NIM"),
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    syarat: list[str] = []
    params: list[Any] = []
    if kode_provinsi is not None:
        syarat.append("kode_provinsi = %s")  # partition pruning: hanya 1 node yang ditanya
        params.append(kode_provinsi)
    if node is not None:
        syarat.append("kode_provinsi = ANY(%s)")  # pruning juga: hanya partisi node itu
        params.append(_kode_node(node))
    if q and q.strip():
        pola = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        syarat.append("(nama ILIKE %s OR nim LIKE %s)")
        params += [f"%{pola}%", f"{pola}%"]
    where = (" WHERE " + " AND ".join(syarat)) if syarat else ""

    total, _ = _baca_dari(("replica", "pusat"), "SELECT count(*)::int AS n FROM identitas" + where, params)
    baris, sumber = _baca_dari(
        ("replica", "pusat"),
        "SELECT tableoid::regclass::text AS fragmen, nim, nama, kode_provinsi, kategori_mbg FROM identitas"
        + where + " ORDER BY nim LIMIT %s OFFSET %s",
        [*params, limit, offset],
    )
    return {"dilayani_oleh": sumber, "total": total[0]["n"], "offset": offset, "jumlah": len(baris), "baris": baris}


@app.get("/penduduk/{nim}", tags=["penduduk"],
         summary="Detail penduduk: cari lokasi di direktori global -> baca langsung ke node pemilik")
def detail_penduduk(nim: str) -> dict[str, Any]:
    lokasi, sumber = _baca_dari(
        ("pusat", "replica"), "SELECT node, kode_provinsi FROM direktori_penduduk WHERE nim = %s", (nim,)
    )
    if not lokasi:
        raise HTTPException(404, "NIM tidak terdaftar di direktori")
    node = lokasi[0]["node"]
    with sambung(node, autocommit=True) as c:
        data = c.execute(
            """
            SELECT i.nim, i.nama, i.jenis_kelamin, i.tanggal_lahir, i.alamat, i.kode_provinsi, i.kategori_mbg,
                   s.perkotaan, s.penghasilan_bulanan, s.jumlah_art,
                   round(s.penghasilan_bulanan::numeric / s.jumlah_art)::bigint AS penghasilan_per_kapita,
                   s.pekerjaan_kk, s.pendidikan_kk, s.luas_lantai_m2::float8 AS luas_lantai_m2, s.jenis_lantai, s.sumber_air,
                   s.daya_listrik_va, s.punya_motor, s.punya_mobil, s.punya_lahan,
                   k.skor::float8 AS skor, k.desil, k.metode
            FROM identitas i
            JOIN sosek s USING (nim)
            LEFT JOIN klasifikasi k USING (nim)
            WHERE i.nim = %s
            """,
            (nim,),
        ).fetchone()
    if data is None:
        raise HTTPException(409, "Ada di direktori tapi tidak ada di node (tidak konsisten / transaksi in-doubt)")
    return {"lokasi": {"node": node, "direktori_dibaca_dari": sumber}, "data": data}


# =====================================================================
# Penduduk — TULIS (selalu lewat 2PC)
# =====================================================================
@app.post("/penduduk", tags=["2PC"], status_code=201,
          summary="Registrasi penduduk: 2PC pusat (direktori) + node wilayah (identitas & sosek)")
def daftar_baru(data: PendudukIn, response: Response, simulasi: Simulasi | None = None) -> dict[str, Any]:
    node, nama_provinsi = _alokasi(data.kode_provinsi)
    with Transaksi2PC("registrasi", simulasi) as tx:
        # Pusat dulu: kalau NIM sudah ada di wilayah mana pun, langsung ditolak di sini
        tx.peserta("pusat").execute(
            "INSERT INTO direktori_penduduk (nim, node, kode_provinsi) VALUES (%s, %s, %s)",
            (data.nim, node, data.kode_provinsi),
        )
        n = tx.peserta(node)
        insert_satu(n, "identitas", {
            "nim": data.nim,
            "nama": data.nama,
            "jenis_kelamin": data.jenis_kelamin,
            "tanggal_lahir": data.tanggal_lahir,
            "alamat": data.alamat,
            "kode_provinsi": data.kode_provinsi,
            "kategori_mbg": list(data.kategori_mbg),
        })
        insert_satu(n, "sosek", {"nim": data.nim, "kode_provinsi": data.kode_provinsi, **data.sosek.model_dump()})
        hasil = tx.selesaikan()
    _kode_http(hasil, response)
    return {"nim": data.nim, "node": node, "provinsi": nama_provinsi, **hasil}


@app.post("/penduduk/{nim}/pindah", tags=["2PC"],
          summary="Pindah domisili. Beda node = 2PC 3 peserta (node asal, node tujuan, pusat)")
def pindah_domisili(nim: str, data: PindahIn, response: Response,
                    simulasi: Simulasi | None = None) -> dict[str, Any]:
    with sambung("pusat", autocommit=True) as c:
        lokasi = c.execute("SELECT node, kode_provinsi FROM direktori_penduduk WHERE nim = %s", (nim,)).fetchone()
    if lokasi is None:
        raise HTTPException(404, "NIM tidak terdaftar di direktori")
    node_asal = lokasi["node"]
    node_tujuan, nama_provinsi = _alokasi(data.kode_provinsi_baru)

    with Transaksi2PC("pindah_domisili", simulasi) as tx:
        asal = tx.peserta(node_asal)
        if node_asal == node_tujuan:
            # Masih satu node: cukup UPDATE (sosek & klasifikasi ikut lewat FK ON UPDATE CASCADE)
            n = asal.execute(
                "UPDATE identitas SET kode_provinsi = %s, alamat = coalesce(%s, alamat) WHERE nim = %s",
                (data.kode_provinsi_baru, data.alamat_baru, nim),
            ).rowcount
            if n != 1:
                raise HTTPException(409, "Data tidak ditemukan di node asal")
            if data.perkotaan_baru is not None:
                asal.execute("UPDATE sosek SET perkotaan = %s, diperbarui = now() WHERE nim = %s",
                             (data.perkotaan_baru, nim))
        else:
            # Beda node: baca + kunci di node asal, hapus, lalu sisipkan di node tujuan
            ident = asal.execute("SELECT * FROM identitas WHERE nim = %s FOR UPDATE", (nim,)).fetchone()
            if ident is None:
                raise HTTPException(409, "Data tidak ditemukan di node asal")
            sos = asal.execute("SELECT * FROM sosek WHERE nim = %s FOR UPDATE", (nim,)).fetchone()
            kls = asal.execute("SELECT * FROM klasifikasi WHERE nim = %s", (nim,)).fetchone()
            asal.execute("DELETE FROM identitas WHERE nim = %s", (nim,))  # sosek & klasifikasi ikut (CASCADE)

            ident.update(kode_provinsi=data.kode_provinsi_baru, alamat=data.alamat_baru or ident["alamat"])
            sos.update(kode_provinsi=data.kode_provinsi_baru)
            if data.perkotaan_baru is not None:
                sos.update(perkotaan=data.perkotaan_baru)
            tujuan = tx.peserta(node_tujuan)
            insert_satu(tujuan, "identitas", ident)
            insert_satu(tujuan, "sosek", sos)
            if kls is not None:
                # desil = peringkat NASIONAL, jadi tetap berlaku walau pindah node
                kls.update(kode_provinsi=data.kode_provinsi_baru)
                insert_satu(tujuan, "klasifikasi", kls)

        tx.peserta("pusat").execute(
            "UPDATE direktori_penduduk SET node = %s, kode_provinsi = %s, diubah = now() WHERE nim = %s",
            (node_tujuan, data.kode_provinsi_baru, nim),
        )
        hasil = tx.selesaikan()
    _kode_http(hasil, response)
    return {"nim": nim, "dari": node_asal, "ke": node_tujuan, "provinsi_baru": nama_provinsi, **hasil}


# =====================================================================
# Desil nasional (agregat HOLISTIK: butuh data semua node)
# =====================================================================
SQL_TETAPKAN_DESIL = """
INSERT INTO klasifikasi (nim, kode_provinsi, skor, desil, metode, dihitung)
SELECT s.nim, s.kode_provinsi, x.skor, width_bucket(x.skor, %s::numeric[]) + 1, 'rule_v1', now()
FROM sosek s
CROSS JOIN LATERAL (SELECT hitung_skor(s) AS skor) x
ON CONFLICT (nim) DO UPDATE
    SET skor = EXCLUDED.skor, desil = EXCLUDED.desil, metode = EXCLUDED.metode, dihitung = EXCLUDED.dihitung
"""


@app.post("/desil/hitung", tags=["2PC"],
          summary="Tetapkan desil nasional: skor lokal di node -> cut-off global -> tulis atomik (2PC)")
def hitung_desil(response: Response, simulasi: Simulasi | None = None) -> dict[str, Any]:
    # Langkah 1 — skor dihitung LOKAL di tiap node. Yang dikirim ke koordinator
    # HANYA angka skor (tanpa NIM/nama): data pribadi tidak keluar dari node.
    skor: list[float] = []
    per_node: dict[str, int] = {}
    for node in NODE_WILAYAH:
        try:
            with sambung(node, autocommit=True) as c:
                if c.execute("SELECT count(*) AS n FROM ref_garis_kemiskinan").fetchone()["n"] == 0:
                    raise HTTPException(409, f"ref_garis_kemiskinan kosong di node {node} (cek logical replication)")
                nilai = [float(r["skor"]) for r in c.execute("SELECT hitung_skor(s) AS skor FROM sosek s").fetchall()]
        except psycopg.OperationalError as e:
            raise HTTPException(503, {
                "pesan": f"Node {node} tidak bisa dihubungi. Desil adalah peringkat NASIONAL (agregat holistik), "
                         "jadi tidak bisa dihitung kalau ada fragmen yang hilang.",
                "detail": ringkas(e),
            }) from e
        per_node[node] = len(nilai)
        skor.extend(nilai)
    if len(skor) < 10:
        raise HTTPException(409, "Data terlalu sedikit (minimal 10). Jalankan seeding dulu.")

    # Langkah 2 — 9 titik potong desil dari SELURUH skor (di koordinator)
    cutoff = [round(x, 4) for x in statistics.quantiles(skor, n=10, method="inclusive")]

    # Langkah 3 — semua node menetapkan desil dengan cut-off yang SAMA, atomik lewat 2PC
    with Transaksi2PC("penetapan_desil", simulasi) as tx:
        for node in NODE_WILAYAH:
            tx.peserta(node).execute(SQL_TETAPKAN_DESIL, (cutoff,))
        hasil = tx.selesaikan()
    _kode_http(hasil, response)
    return {"jumlah_skor": len(skor), "skor_per_node": per_node, "cutoff_desil": cutoff, **hasil}


# =====================================================================
# Dashboard
# =====================================================================
# Query yang SAMA bisa jalan di pusat (global, lewat FDW) MAUPUN langsung di
# node (lokal) karena nama tabelnya sama — itulah transparansi lokasi.
Q_RINGKASAN = """
WITH agg AS (
    SELECT i.kode_provinsi,
           count(*)                   AS jumlah_penduduk,
           sum(s.penghasilan_bulanan) AS total_penghasilan,
           sum(s.jumlah_art)          AS total_art,
           count(*) FILTER (WHERE s.penghasilan_bulanan::numeric / s.jumlah_art
                                  < CASE WHEN s.perkotaan THEN %(gk_kota)s ELSE %(gk_desa)s END)
                                      AS di_bawah_garis_kemiskinan,
           count(*) FILTER (WHERE 'peserta_didik' = ANY (i.kategori_mbg)) AS mbg_peserta_didik,
           count(*) FILTER (WHERE 'balita'        = ANY (i.kategori_mbg)) AS mbg_balita,
           count(*) FILTER (WHERE 'ibu_hamil'     = ANY (i.kategori_mbg)) AS mbg_ibu_hamil,
           count(*) FILTER (WHERE 'ibu_menyusui'  = ANY (i.kategori_mbg)) AS mbg_ibu_menyusui,
           count(*) FILTER (WHERE 'pendidik'      = ANY (i.kategori_mbg)) AS mbg_pendidik
    FROM identitas i
    JOIN sosek s ON s.nim = i.nim AND s.kode_provinsi = i.kode_provinsi
    GROUP BY i.kode_provinsi
)
SELECT w.node, a.kode_provinsi, w.nama_provinsi, a.jumlah_penduduk,
       round(a.total_penghasilan::numeric / nullif(a.total_art, 0))::bigint AS penghasilan_per_kapita,
       a.di_bawah_garis_kemiskinan,
       a.mbg_peserta_didik, a.mbg_balita, a.mbg_ibu_hamil, a.mbg_ibu_menyusui, a.mbg_pendidik
FROM agg a
JOIN ref_wilayah_node w USING (kode_provinsi)
ORDER BY a.kode_provinsi
"""

def _q_desil(saring: bool) -> str:
    where = " WHERE kode_provinsi = ANY(%s)" if saring else ""
    return (
        "SELECT desil, sum(n)::int AS jumlah FROM ("
        f"SELECT kode_provinsi, desil, count(*) AS n FROM klasifikasi{where} GROUP BY kode_provinsi, desil"
        ") t GROUP BY desil ORDER BY desil"
    )


@app.get("/dashboard/ringkasan", tags=["dashboard"],
         summary="Ringkasan per provinsi (global via replica/pusat; kalau ada node mati -> mode parsial)")
def ringkasan() -> dict[str, Any]:
    # 1) Mode GLOBAL: satu query ke replica (meringankan pusat), cadangannya pusat
    alasan: list[str] = []
    for sumber in ("replica", "pusat"):
        try:
            with sambung(sumber, autocommit=True) as c:
                params = _garis_kemiskinan(c)
                baris = c.execute(Q_RINGKASAN, params).fetchall()
            return {"mode": "global", "dilayani_oleh": sumber, "garis_kemiskinan": params, "baris": baris}
        except psycopg.OperationalError as e:
            alasan.append(f"{sumber}: {ringkas(e)}")

    # 2) Mode PARSIAL: query yang sama dijalankan langsung di tiap node yang hidup.
    #    Pilihan desain (availability vs consistency): tampilkan data yang ada + tandai yang hilang.
    baris, mati = [], []
    params = None
    for node in NODE_WILAYAH:
        try:
            with sambung(node, autocommit=True) as c:
                params = _garis_kemiskinan(c)
                baris += c.execute(Q_RINGKASAN, params).fetchall()
        except psycopg.OperationalError:
            mati.append(node)
    if len(mati) == len(NODE_WILAYAH):
        raise HTTPException(503, {"pesan": "Tidak ada node yang bisa dihubungi", "detail": alasan})
    return {
        "mode": "parsial",
        "node_tidak_tersedia": mati,
        "catatan": "Data wilayah dari node yang mati TIDAK ikut dihitung.",
        "alasan_fallback": alasan,
        "garis_kemiskinan": params,
        "baris": sorted(baris, key=lambda r: r["kode_provinsi"]),
    }


@app.get("/dashboard/desil", tags=["dashboard"],
         summary="Distribusi desil nasional + jumlah layak per program (bisa difilter per node)")
def distribusi_desil(node: NodeParam | None = None) -> dict[str, Any]:
    # Desil tetap peringkat NASIONAL; filter node hanya memilih penduduk mana yang dihitung.
    if node is None:
        baris, sumber = _baca_dari(("replica", "pusat"), _q_desil(False))
    else:
        baris, sumber = _baca_dari(("replica", "pusat"), _q_desil(True), (_kode_node(node),))
    program, _ = _baca_dari(
        ("replica", "pusat"), "SELECT kode, nama, basis, desil_maks, dasar_hukum FROM ref_program ORDER BY kode"
    )
    per_desil = {r["desil"]: r["jumlah"] for r in baris}
    kelayakan = []
    for p in program:
        if p["basis"] == "desil":
            p["jumlah_layak"] = sum(v for d, v in per_desil.items() if d <= p["desil_maks"])
        else:
            p["jumlah_layak"] = None
            p["catatan"] = "Berbasis kategori sasaran, bukan desil. Lihat kolom mbg_* di /dashboard/ringkasan."
        kelayakan.append(p)
    hasil: dict[str, Any] = {"dilayani_oleh": sumber, "distribusi": baris, "kelayakan_program": kelayakan}
    if not baris:
        hasil["catatan"] = "Belum ada klasifikasi. Jalankan POST /desil/hitung dulu."
    return hasil


@app.get("/dashboard/explain", tags=["dashboard"],
         summary="Rencana eksekusi query ringkasan di pusat (bukti pushdown ke node)")
def explain_ringkasan() -> dict[str, Any]:
    with sambung("pusat", autocommit=True) as c:
        params = _garis_kemiskinan(c)
        # ClientCursor: parameter disisipkan di sisi klien agar EXPLAIN menampilkan nilai aslinya
        cur = psycopg.ClientCursor(c)
        cur.execute("EXPLAIN (VERBOSE, COSTS OFF) " + Q_RINGKASAN, params)
        rencana = [r["QUERY PLAN"] for r in cur.fetchall()]
    return {
        "cara_baca": "Cari 'Async Foreign Scan' dan 'Relations: Aggregate on (...)': artinya join + agregat "
                     "dikerjakan di masing-masing node secara paralel, pusat hanya menerima hasil per provinsi.",
        "rencana": rencana,
    }


# =====================================================================
# 2PC — log & recovery
# =====================================================================
@app.post("/twopc/pulihkan", tags=["2PC"],
          summary="Recovery: tuntaskan transaksi in-doubt berdasarkan log koordinator")
def pulihkan_2pc(response: Response, umur_min_detik: int = Query(5, ge=0, le=3600)) -> dict[str, Any]:
    hasil = pulihkan(umur_min_detik)
    if not hasil["ok"]:
        response.status_code = 503
    return hasil


@app.get("/twopc/log", tags=["2PC"], summary="Log koordinator 2PC terbaru")
def log_2pc(limit: int = Query(20, ge=1, le=200)) -> dict[str, Any]:
    baris, sumber = _baca_dari(
        ("pusat", "replica"),
        "SELECT gid, operasi, peserta, status, keterangan, dibuat, diubah "
        "FROM twopc_log ORDER BY dibuat DESC LIMIT %s",
        (limit,),
    )
    return {"dibaca_dari": sumber, "baris": baris}
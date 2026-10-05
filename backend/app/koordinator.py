"""
Koordinator Two-Phase Commit (2PC) untuk operasi TULIS lintas node.

Kenapa tidak cukup menulis lewat postgres_fdw di pusat? Karena postgres_fdw
tidak menjamin commit lintas server yang atomik: kalau satu node gagal di
tengah commit, data bisa setengah jadi. Maka backend yang jadi koordinator.

Alur:
  0. Fase kerja   : tiap peserta menjalankan INSERT/UPDATE/DELETE di transaksi lokalnya.
  1. Fase prepare : koordinator meminta semua peserta `PREPARE TRANSACTION 'gid'`.
                    Setelah itu perubahan sudah aman di disk peserta, tapi BELUM terlihat.
                    Satu saja gagal (vote NO) -> semua di-ROLLBACK.
  2. Keputusan    : keputusan COMMIT dicatat di twopc_log (pusat) SEBELUM fase 2.
                    Log inilah pegangan recovery kalau koordinator crash.
  3. Fase commit  : koordinator mengirim `COMMIT PREPARED 'gid'` ke semua peserta.

Recovery (`pulihkan`): transaksi yang masih PREPARED (in-doubt) dituntaskan
berdasarkan log -> COMMIT kalau log = COMMIT, selain itu ROLLBACK (presumed abort).
"""
from __future__ import annotations

import uuid
from typing import Any

import psycopg
from psycopg import sql

from .config import PESERTA_2PC
from .db import sambung

SIMULASI = ("gagal_prepare", "crash_sebelum_keputusan", "crash_setelah_keputusan")


def ringkas(e: BaseException | None) -> str:
    """Baris pertama pesan error (biar respons API tetap ringkas)."""
    if e is None:
        return ""
    teks = str(e).strip() or type(e).__name__
    return teks.splitlines()[0]


class TransaksiGagal(Exception):
    """Transaksi terdistribusi dibatalkan (ABORT)."""

    def __init__(self, pesan: str, gid: str, jejak: list[str], penyebab: BaseException | None = None):
        super().__init__(pesan)
        self.pesan = pesan
        self.gid = gid
        self.jejak = jejak
        self.penyebab = penyebab


def _perintah_gid(perintah: str, gid: str) -> sql.Composed:
    # PREPARE TRANSACTION / COMMIT PREPARED tidak menerima parameter bind,
    # jadi gid disisipkan sebagai literal yang di-escape dengan benar.
    return sql.SQL(perintah + " {}").format(sql.Literal(gid))


def _catat_log(gid: str, status: str, *, operasi: str | None = None,
               peserta: list[str] | None = None, keterangan: str | None = None) -> None:
    """Tulis ke twopc_log di pusat dengan transaksi TERPISAH (autocommit) -> langsung durable."""
    with sambung("pusat", autocommit=True) as c:
        if operasi is not None:
            c.execute(
                "INSERT INTO twopc_log (gid, operasi, peserta, status, keterangan) "
                "VALUES (%s, %s, %s, %s, %s)",
                (gid, operasi, peserta or [], status, keterangan),
            )
        else:
            c.execute(
                "UPDATE twopc_log SET status = %s, keterangan = coalesce(%s, keterangan), diubah = now() "
                "WHERE gid = %s",
                (status, keterangan, gid),
            )


class Transaksi2PC:
    """
    Contoh pemakaian:

        with Transaksi2PC("registrasi") as tx:
            tx.peserta("pusat").execute("INSERT ...")
            tx.peserta("tengah").execute("INSERT ...")
            hasil = tx.selesaikan()

    Error apa pun sebelum selesaikan() -> semua transaksi lokal otomatis di-ROLLBACK.
    """

    def __init__(self, operasi: str, simulasi: str | None = None):
        if simulasi is not None and simulasi not in SIMULASI:
            raise ValueError(f"simulasi tidak dikenal: {simulasi}")
        self.operasi = operasi
        self.simulasi = simulasi
        self.gid = f"mbg-{uuid.uuid4().hex[:12]}"
        self.jejak: list[str] = []
        self._conn: dict[str, psycopg.Connection] = {}
        self._selesai = False

    # ------------------------------------------------------------------ fase kerja
    def peserta(self, node: str) -> psycopg.Connection:
        """Koneksi (di dalam transaksi) ke node peserta. Dibuka saat pertama dipakai."""
        if node not in PESERTA_2PC:
            raise ValueError(f"'{node}' tidak bisa menjadi peserta 2PC")
        if node not in self._conn:
            self._conn[node] = sambung(node, autocommit=False)
            self.jejak.append(f"[kerja] {node}: mulai transaksi lokal")
        return self._conn[node]

    def __enter__(self) -> "Transaksi2PC":
        return self

    def __exit__(self, exc_type, exc, tb) -> bool:
        try:
            if exc is not None and not self._selesai:
                self.jejak.append(f"[kerja] error: {ringkas(exc)} -> ROLLBACK semua transaksi lokal")
                self._rollback_lokal()
                self._coba_catat_abort(ringkas(exc))
                if isinstance(exc, psycopg.Error):
                    raise TransaksiGagal(
                        "Transaksi dibatalkan pada fase kerja", self.gid, self.jejak, exc
                    ) from exc
        finally:
            self._tutup_semua()
        return False

    # ------------------------------------------------------------------ 2 fase
    def selesaikan(self) -> dict[str, Any]:
        """Jalankan fase 1 (PREPARE), catat keputusan, lalu fase 2 (COMMIT PREPARED)."""
        peserta = list(self._conn)
        if not peserta:
            raise ValueError("Belum ada peserta")
        _catat_log(self.gid, "MULAI", operasi=self.operasi, peserta=peserta)
        self.jejak.append(f"[koordinator] gid={self.gid} peserta={peserta} -> log MULAI")

        # ---------------- FASE 1: PREPARE (voting) ----------------
        siap: list[str] = []
        try:
            for i, node in enumerate(peserta):
                if self.simulasi == "gagal_prepare" and i == len(peserta) - 1:
                    raise RuntimeError(f"simulasi: {node} memberi suara NO")
                conn = self._conn[node]
                conn.execute(_perintah_gid("PREPARE TRANSACTION", self.gid))
                conn.autocommit = True  # sesi sudah lepas dari transaksi, siap untuk fase 2
                siap.append(node)
                self.jejak.append(f"[fase 1] {node}: PREPARE TRANSACTION -> YES")
            _catat_log(self.gid, "PREPARED")
            self.jejak.append("[koordinator] semua peserta YES -> log PREPARED")
        except Exception as e:
            self._abort_global(siap, e)
            raise TransaksiGagal("Transaksi dibatalkan pada fase 1 (prepare)", self.gid, self.jejak, e) from e

        if self.simulasi == "crash_sebelum_keputusan":
            self.jejak.append(
                "[simulasi] koordinator 'crash' SEBELUM mencatat keputusan -> semua peserta IN-DOUBT"
            )
            self._selesai = True
            return self._hasil("IN-DOUBT", peserta)

        # ---------------- KEPUTUSAN (harus durable sebelum fase 2) ----------------
        try:
            _catat_log(self.gid, "COMMIT")
        except psycopg.Error as e:
            # Keputusan gagal dicatat -> belum ada peserta yang commit -> aman untuk ABORT
            self._abort_global(siap, e)
            raise TransaksiGagal(
                "Keputusan COMMIT gagal dicatat di log koordinator", self.gid, self.jejak, e
            ) from e
        self.jejak.append("[koordinator] keputusan COMMIT dicatat di log (durable)")

        # ---------------- FASE 2: COMMIT PREPARED ----------------
        tertunda: list[str] = []
        for i, node in enumerate(peserta):
            if self.simulasi == "crash_setelah_keputusan" and i == 1:
                self.jejak.append(
                    "[simulasi] koordinator 'crash' di TENGAH fase 2 -> sisa peserta masih PREPARED"
                )
                self._selesai = True
                return self._hasil("COMMIT-SEBAGIAN", peserta[i:])
            try:
                self._jalankan_prepared("COMMIT PREPARED", node)
                self.jejak.append(f"[fase 2] {node}: COMMIT PREPARED")
            except psycopg.Error as e:
                tertunda.append(node)
                self.jejak.append(
                    f"[fase 2] {node}: gagal ({ringkas(e)}) -> tertunda, tuntaskan lewat POST /twopc/pulihkan"
                )
        self._selesai = True
        if tertunda:
            return self._hasil("COMMIT-TERTUNDA", tertunda)
        try:
            _catat_log(self.gid, "SELESAI")
        except psycopg.Error:
            pass  # data sudah commit di semua peserta; status log dirapikan oleh pulihkan()
        self.jejak.append("[koordinator] semua peserta commit -> log SELESAI")
        return self._hasil("COMMIT", [])

    # ------------------------------------------------------------------ helper
    def _hasil(self, status: str, tertunda: list[str]) -> dict[str, Any]:
        return {
            "gid": self.gid,
            "operasi": self.operasi,
            "status": status,
            "peserta": list(self._conn),
            "tertunda": tertunda,
            "jejak": self.jejak,
        }

    def _jalankan_prepared(self, perintah: str, node: str) -> None:
        """Kirim COMMIT/ROLLBACK PREPARED. Kalau koneksi lama putus, coba sekali dengan koneksi baru."""
        conn = self._conn.get(node)
        try:
            if conn is None or conn.closed:
                raise psycopg.OperationalError("koneksi tertutup")
            conn.execute(_perintah_gid(perintah, self.gid))
        except psycopg.OperationalError:
            with sambung(node, autocommit=True) as baru:
                baru.execute(_perintah_gid(perintah, self.gid))

    def _abort_global(self, siap: list[str], penyebab: BaseException) -> None:
        self.jejak.append(f"[fase 1] gagal: {ringkas(penyebab)} -> ABORT global")
        for node, conn in self._conn.items():
            try:
                if node in siap:
                    self._jalankan_prepared("ROLLBACK PREPARED", node)
                    self.jejak.append(f"[abort] {node}: ROLLBACK PREPARED")
                else:
                    conn.rollback()
                    self.jejak.append(f"[abort] {node}: ROLLBACK")
            except psycopg.Error as e:
                self.jejak.append(f"[abort] {node}: gagal ({ringkas(e)}) -> bereskan lewat POST /twopc/pulihkan")
        self._selesai = True
        try:
            _catat_log(self.gid, "ABORT", keterangan=ringkas(penyebab))
        except psycopg.Error:
            pass

    def _rollback_lokal(self) -> None:
        for conn in self._conn.values():
            try:
                if not conn.closed:
                    conn.rollback()
            except psycopg.Error:
                pass

    def _coba_catat_abort(self, alasan: str) -> None:
        try:
            _catat_log(self.gid, "ABORT", operasi=self.operasi, peserta=list(self._conn), keterangan=alasan)
        except psycopg.Error:
            pass  # pusat mungkin mati; tetap aman karena belum ada peserta yang PREPARE

    def _tutup_semua(self) -> None:
        for conn in self._conn.values():
            try:
                conn.close()
            except psycopg.Error:
                pass


def pulihkan(umur_min_detik: int = 5) -> dict[str, Any]:
    """
    Tuntaskan transaksi IN-DOUBT (masih PREPARED) di semua peserta:
      log = COMMIT -> COMMIT PREPARED   (keputusan sudah diambil, wajib dituntaskan)
      selain itu   -> ROLLBACK PREPARED (presumed abort)
    Transaksi yang log-nya berubah < umur_min_detik yang lalu dilewati
    (mungkin masih berjalan, bukan korban crash).
    """
    # 1) Kumpulkan transaksi PREPARED di setiap peserta
    prepared: dict[str, list[str]] = {}
    tak_terjangkau: list[str] = []
    for node in PESERTA_2PC:
        try:
            with sambung(node, autocommit=True) as c:
                rows = c.execute(
                    "SELECT gid FROM pg_prepared_xacts "
                    "WHERE gid LIKE 'mbg-%' AND database = current_database() ORDER BY prepared"
                ).fetchall()
            prepared[node] = [r["gid"] for r in rows]
        except psycopg.OperationalError:
            tak_terjangkau.append(node)

    # 2) Baca keputusan dari log koordinator. Tanpa log, TIDAK AMAN memutuskan.
    semua_gid = sorted({g for daftar in prepared.values() for g in daftar})
    try:
        with sambung("pusat", autocommit=True) as c:
            log = {
                r["gid"]: r
                for r in c.execute(
                    "SELECT gid, status, (now() - diubah) >= make_interval(secs => %s) AS cukup_lama "
                    "FROM twopc_log WHERE status IN ('MULAI', 'PREPARED', 'COMMIT') OR gid = ANY(%s::text[])",
                    (umur_min_detik, semua_gid),
                ).fetchall()
            }
    except psycopg.Error as e:
        return {
            "ok": False,
            "pesan": "Log koordinator di pusat tidak bisa dibaca -> TIDAK AMAN memutuskan nasib "
                     "transaksi in-doubt. Hidupkan pusat dulu, lalu ulangi.",
            "detail": ringkas(e),
            "prepared_per_node": prepared,
            "node_tak_terjangkau": tak_terjangkau,
        }

    # 3) Eksekusi keputusan di tiap peserta
    tindakan: list[dict[str, Any]] = []
    for node, daftar in prepared.items():
        for gid in daftar:
            entri = log.get(gid)
            if entri is not None and not entri["cukup_lama"]:
                tindakan.append({"node": node, "gid": gid, "aksi": "DILEWATI (masih baru, mungkin sedang berjalan)"})
                continue
            status_log = entri["status"] if entri else None
            aksi = "COMMIT PREPARED" if status_log == "COMMIT" else "ROLLBACK PREPARED"
            try:
                with sambung(node, autocommit=True) as c:
                    c.execute(_perintah_gid(aksi, gid))
                tindakan.append({"node": node, "gid": gid, "status_log": status_log, "aksi": aksi})
            except psycopg.Error as e:
                tindakan.append({"node": node, "gid": gid, "status_log": status_log, "aksi": f"GAGAL: {ringkas(e)}"})

    # 4) Rapikan status log — hanya kalau semua peserta terjangkau
    diperbarui: list[str] = []
    if not tak_terjangkau:
        belum_beres = {t["gid"] for t in tindakan if not t["aksi"].endswith("PREPARED")}
        with sambung("pusat", autocommit=True) as c:
            for gid, entri in log.items():
                if gid in belum_beres or not entri["cukup_lama"]:
                    continue
                if entri["status"] == "COMMIT":
                    c.execute(
                        "UPDATE twopc_log SET status = 'SELESAI', keterangan = 'dituntaskan oleh pemulihan', "
                        "diubah = now() WHERE gid = %s", (gid,))
                    diperbarui.append(gid)
                elif entri["status"] in ("MULAI", "PREPARED"):
                    c.execute(
                        "UPDATE twopc_log SET status = 'ABORT', keterangan = 'dibatalkan oleh pemulihan (presumed abort)', "
                        "diubah = now() WHERE gid = %s", (gid,))
                    diperbarui.append(gid)

    hasil: dict[str, Any] = {
        "ok": True,
        "aturan": "log COMMIT -> COMMIT PREPARED; selain itu -> ROLLBACK PREPARED (presumed abort)",
        "tindakan": tindakan,
        "log_diperbarui": diperbarui,
        "node_tak_terjangkau": tak_terjangkau,
    }
    if tak_terjangkau:
        hasil["catatan"] = "Ada node yang tidak terjangkau; status log belum dirapikan. Ulangi setelah node hidup."
    return hasil

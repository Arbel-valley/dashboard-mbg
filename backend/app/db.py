"""Helper koneksi (psycopg 3) dan INSERT dinamis yang aman dari SQL injection."""
from __future__ import annotations

from typing import Any

import psycopg
from psycopg import sql
from psycopg.rows import dict_row

from .config import DSN


def sambung(node: str, autocommit: bool = False) -> psycopg.Connection:
    """Buka koneksi ke satu node. Baris hasil query berupa dict."""
    return psycopg.connect(
        DSN[node],
        autocommit=autocommit,
        row_factory=dict_row,
        connect_timeout=3,
        application_name="mbg-backend",
        # lock_timeout: kalau baris terkunci transaksi 2PC yang menggantung
        # (in-doubt), request gagal dalam 3 detik alih-alih menunggu selamanya.
        options="-c lock_timeout=3000 -c statement_timeout=30000",
    )


def _query_insert(tabel: str, kolom: list[str]) -> sql.Composed:
    return sql.SQL("INSERT INTO {} ({}) VALUES ({})").format(
        sql.Identifier(tabel),
        sql.SQL(", ").join(map(sql.Identifier, kolom)),
        sql.SQL(", ").join(sql.Placeholder() * len(kolom)),
    )


def insert_satu(conn: psycopg.Connection, tabel: str, baris: dict[str, Any]) -> None:
    kolom = list(baris)
    conn.execute(_query_insert(tabel, kolom), [baris[k] for k in kolom])


def insert_banyak(conn: psycopg.Connection, tabel: str, daftar: list[dict[str, Any]]) -> None:
    if not daftar:
        return
    kolom = list(daftar[0])
    with conn.cursor() as cur:
        cur.executemany(_query_insert(tabel, kolom), [[b[k] for k in kolom] for b in daftar])

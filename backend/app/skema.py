"""Skema request (Pydantic). Contoh isian muncul otomatis di Swagger (/docs)."""
from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

KategoriMBG = Literal["peserta_didik", "balita", "ibu_hamil", "ibu_menyusui", "pendidik"]

# Skenario uji 2PC (dipilih lewat query parameter ?simulasi=...)
Simulasi = Literal["gagal_prepare", "crash_sebelum_keputusan", "crash_setelah_keputusan"]


class SosekIn(BaseModel):
    perkotaan: bool
    penghasilan_bulanan: int = Field(ge=0, description="Penghasilan RUMAH TANGGA per bulan (Rp)")
    jumlah_art: int = Field(ge=1, le=20, description="Jumlah anggota rumah tangga")
    pekerjaan_kk: str = Field(min_length=1)
    pendidikan_kk: str = Field(min_length=1)
    luas_lantai_m2: float = Field(gt=0)
    jenis_lantai: Literal["tanah", "semen", "keramik"]
    sumber_air: Literal["sungai", "sumur_tak_terlindung", "sumur_terlindung", "pdam", "air_kemasan"]
    daya_listrik_va: int = Field(ge=0)
    punya_motor: bool = False
    punya_mobil: bool = False
    punya_lahan: bool = False


class PendudukIn(BaseModel):
    nim: str = Field(pattern=r"^[0-9]{8,20}$", description="NIM (pengganti NIK), 8-20 digit angka")
    nama: str = Field(min_length=1)
    jenis_kelamin: Literal["L", "P"]
    tanggal_lahir: date
    alamat: str | None = None
    kode_provinsi: int = Field(ge=11, le=99, description="Kode provinsi Kemendagri, mis. 32 = Jawa Barat")
    kategori_mbg: list[KategoriMBG] = []
    sosek: SosekIn

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "nim": "80000000001",
                    "nama": "Siti Rahmawati",
                    "jenis_kelamin": "P",
                    "tanggal_lahir": "1998-04-12",
                    "alamat": "Jl. Kenanga No. 5, Jawa Barat",
                    "kode_provinsi": 32,
                    "kategori_mbg": ["ibu_menyusui"],
                    "sosek": {
                        "perkotaan": True,
                        "penghasilan_bulanan": 2800000,
                        "jumlah_art": 4,
                        "pekerjaan_kk": "buruh_bangunan",
                        "pendidikan_kk": "smp",
                        "luas_lantai_m2": 30,
                        "jenis_lantai": "semen",
                        "sumber_air": "sumur_terlindung",
                        "daya_listrik_va": 900,
                        "punya_motor": True,
                        "punya_mobil": False,
                        "punya_lahan": False,
                    },
                }
            ]
        }
    }


class PindahIn(BaseModel):
    kode_provinsi_baru: int = Field(ge=11, le=99)
    alamat_baru: str | None = None
    perkotaan_baru: bool | None = None

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"kode_provinsi_baru": 73, "alamat_baru": "Jl. Pettarani No. 10, Sulawesi Selatan", "perkotaan_baru": True}
            ]
        }
    }

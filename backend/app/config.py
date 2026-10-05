"""Konfigurasi koneksi ke semua node (dibaca dari environment variable)."""
import os

_PW = os.getenv("APP_PASSWORD", "app_dev_123")

# Default = port di host, supaya backend juga bisa dijalankan di luar Docker
# (mis. `uvicorn app.main:app --reload` dari laptop).
# Di dalam Docker, docker-compose.yml mengisi DSN_* dengan nama service.
DSN: dict[str, str] = {
    "pusat": os.getenv("DSN_PUSAT", f"postgresql://app_user:{_PW}@localhost:5440/mbg"),
    "replica": os.getenv("DSN_REPLICA", f"postgresql://app_user:{_PW}@localhost:5441/mbg"),
    "barat": os.getenv("DSN_BARAT", f"postgresql://app_user:{_PW}@localhost:5442/mbg"),
    "tengah": os.getenv("DSN_TENGAH", f"postgresql://app_user:{_PW}@localhost:5443/mbg"),
    "timur": os.getenv("DSN_TIMUR", f"postgresql://app_user:{_PW}@localhost:5444/mbg"),
}

NODE_WILAYAH: tuple[str, ...] = ("barat", "tengah", "timur")

# Node yang boleh ikut 2PC. Replica tidak termasuk karena read-only.
PESERTA_2PC: tuple[str, ...] = ("pusat", *NODE_WILAYAH)

CORS_ORIGINS: list[str] = [
    o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()
]

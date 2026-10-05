// Klien API. Semua request lewat /api/* -> diteruskan Next.js ke FastAPI (lihat next.config.ts).
import type { Gagal2PC } from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** Body error berisi jejak 2PC (transaksi dibatalkan)? */
  get gagal2pc(): Gagal2PC | null {
    const b = this.body as Partial<Gagal2PC> | null;
    return b && b.status === "ABORT" && Array.isArray(b.jejak) ? (b as Gagal2PC) : null;
  }
}

type DetailValidasi = { loc?: (string | number)[]; msg?: string };

/** Backend punya 4 bentuk error; ambil kalimat yang paling berguna dari masing-masing. */
function pesanDari(status: number, body: unknown): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.jenis === "string") return b.jenis; // transaksi 2PC dibatalkan
    if (typeof b.pesan === "string") return b.pesan; // error database (psycopg)
    const d = b.detail;
    if (typeof d === "string") return d; // HTTPException(detail="...")
    if (Array.isArray(d)) {
      // 422 validasi Pydantic
      return (
        "Isian belum valid: " +
        (d as DetailValidasi[]).map((x) => `${x.loc?.at(-1) ?? "?"} (${x.msg ?? "tidak valid"})`).join("; ")
      );
    }
    if (d && typeof d === "object" && typeof (d as { pesan?: unknown }).pesan === "string") {
      return (d as { pesan: string }).pesan; // HTTPException(detail={"pesan": ...})
    }
  }
  return `Permintaan gagal (HTTP ${status}).`;
}

export async function panggil<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, null, "Server Next.js tidak bisa dihubungi. Pastikan `npm run dev` masih berjalan.");
  }

  const teks = await res.text();
  let body: unknown = null;
  try {
    body = teks ? JSON.parse(teks) : null;
  } catch {
    body = null;
  }

  if (!res.ok && body === null) {
    // Rewrite gagal menjangkau FastAPI: Next.js mengembalikan halaman error, bukan JSON.
    throw new ApiError(
      res.status,
      teks,
      "Backend FastAPI tidak menjawab. Cek `docker compose ps` dan nilai API_URL di .env.local.",
    );
  }
  if (!res.ok) throw new ApiError(res.status, body, pesanDari(res.status, body));
  return body as T;
}

/** Fetcher untuk SWR: key = path API, mis. "/status". */
export const fetcher = <T>(path: string) => panggil<T>(path);

export const kirim = <T>(path: string, data?: unknown) =>
  panggil<T>(path, { method: "POST", body: data === undefined ? undefined : JSON.stringify(data) });

/** Tambahkan ?simulasi=... hanya kalau dipilih. */
export function denganSimulasi(path: string, simulasi: string) {
  return simulasi ? `${path}${path.includes("?") ? "&" : "?"}simulasi=${encodeURIComponent(simulasi)}` : path;
}

import { ErrorState } from "@/components/error-state";
import { Jejak2PC } from "@/components/jejak-2pc";
import type { IsiToast } from "@/components/toast";
import { ApiError } from "@/lib/api";
import type { Hasil2PC } from "@/lib/types";

export type HasilKirim = { ok: true; data: Hasil2PC } | { ok: false; error: unknown } | null;

/** Ringkasan satu kalimat untuk toast, dari hasil operasi tulis (2PC). */
export function ringkasHasil(hasil: Exclude<HasilKirim, null>, suksesJudul: string): IsiToast {
  if (hasil.ok) {
    const d = hasil.data;
    if (d.status === "COMMIT") {
      return { jenis: "sukses", judul: suksesJudul, isi: `Commit di ${d.peserta.join(", ")}.` };
    }
    return {
      jenis: "gantung",
      judul: d.status === "IN-DOUBT" ? "Transaksi menggantung" : "Commit belum tuntas",
      isi: `Menunggu pemulihan di ${d.tertunda.join(", ")}.`,
      tautan: { label: "Buka status cluster", href: "/cluster" },
    };
  }
  const e = hasil.error instanceof ApiError ? hasil.error : null;
  return {
    jenis: "gagal",
    judul: e?.gagal2pc ? "Transaksi dibatalkan" : "Gagal",
    isi: e?.message ?? (hasil.error instanceof Error ? hasil.error.message : "Permintaan gagal."),
  };
}

/** Detail hasil operasi tulis: status + jejak 2PC (dilipat) atau penjelasan error. */
export function HasilTransaksi({ hasil, children }: { hasil: HasilKirim; children?: React.ReactNode }) {
  if (!hasil) return null;
  if (hasil.ok) {
    return (
      <div className="space-y-3">
        <Jejak2PC status={hasil.data.status} gid={hasil.data.gid} jejak={hasil.data.jejak} tertunda={hasil.data.tertunda} lipat />
        {children}
      </div>
    );
  }
  const gagal = hasil.error instanceof ApiError ? hasil.error.gagal2pc : null;
  if (gagal) {
    return (
      <div className="space-y-3">
        <ErrorState error={hasil.error} />
        <Jejak2PC status="ABORT" gid={gagal.gid} jejak={gagal.jejak} lipat />
      </div>
    );
  }
  return <ErrorState error={hasil.error} />;
}

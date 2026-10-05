"use client";

import Link from "next/link";
import { useKini } from "@/lib/kini";
import { NODE_WILAYAH } from "@/lib/node";
import type { StatusCluster } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Satu chip ringkas kondisi cluster + indikator "live".
 * Netral saat sehat, berwarna hanya kalau ada masalah.
 */
export function StatusRingkas({
  status,
  gagal,
  diperbarui,
}: {
  status?: StatusCluster;
  gagal?: boolean;
  diperbarui?: number | null;
}) {
  const kini = useKini();
  let teks = "Memeriksa cluster...";
  let titik = "bg-line";
  let gaya = "text-ink-soft";
  let sehat = false;

  if (gagal) {
    teks = "Backend tidak menjawab";
    titik = "bg-bahaya";
    gaya = "text-bahaya";
  } else if (status) {
    const semua = ["pusat", "replica", ...NODE_WILAYAH] as const;
    const mati = semua.filter((k) => !status[k].hidup);
    const menggantung = (["pusat", ...NODE_WILAYAH] as const).reduce(
      (n, k) => n + (status[k].prepared_xacts?.length ?? 0),
      0,
    );
    if (mati.length) {
      teks = `${mati.map((m) => (m === "pusat" || m === "replica" ? m : `node ${m}`)).join(", ")} mati`;
      titik = "bg-bahaya";
      gaya = "text-bahaya";
    } else if (menggantung) {
      teks = `${menggantung} transaksi menggantung`;
      titik = "bg-gantung";
      gaya = "text-gantung";
    } else {
      teks = `${semua.length} database aktif`;
      titik = "bg-barat";
      gaya = "text-ink";
      sehat = true;
    }
  }

  const detik = diperbarui && kini ? Math.max(0, Math.round((kini - diperbarui) / 1000)) : null;
  const umur = detik == null ? null : detik < 2 ? "baru saja" : detik < 60 ? `${detik} dtk lalu` : `${Math.floor(detik / 60)} mnt lalu`;

  return (
    <Link
      href="/cluster"
      title="Status diperbarui otomatis tiap 5 detik"
      className={cn("inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-[13px] hover:bg-secondary", gaya)}
    >
      <span className="relative flex size-2" aria-hidden>
        {sehat ? <span className={cn("absolute inset-0 animate-ping rounded-full opacity-60", titik)} /> : null}
        <span className={cn("relative size-2 rounded-full", titik)} />
      </span>
      <span className="whitespace-nowrap">{teks}</span>
      {umur ? <span className="hidden border-l border-line pl-2 whitespace-nowrap text-ink-soft lg:inline">{umur}</span> : null}
    </Link>
  );
}

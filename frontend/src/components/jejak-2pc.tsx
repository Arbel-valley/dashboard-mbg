import { StatusBadge } from "@/components/status-badge";
import { NODE } from "@/lib/node";
import type { NodeWilayah, Status2PC } from "@/lib/types";
import { cn } from "@/lib/utils";

const TAG: Record<string, string> = {
  kerja: "Kerja",
  koordinator: "Koordinator",
  "fase 1": "Fase 1 (prepare)",
  "fase 2": "Fase 2 (commit)",
  simulasi: "Simulasi",
  abort: "Pembatalan",
};

const WARNA_NODE: Record<string, string> = {
  pusat: "text-ink font-semibold",
  barat: `${NODE.barat.teks} font-semibold`,
  tengah: `${NODE.tengah.teks} font-semibold`,
  timur: `${NODE.timur.teks} font-semibold`,
};

function penjelasan(status: Status2PC, tertunda: string[]) {
  const daftar = tertunda.join(", ");
  switch (status) {
    case "COMMIT":
      return "Semua peserta menyimpan perubahan secara bersamaan.";
    case "ABORT":
      return "Transaksi dibatalkan di semua peserta. Tidak ada data yang berubah.";
    case "IN-DOUBT":
      return `Koordinator berhenti sebelum memutuskan. Peserta ${daftar} menahan kunci datanya sampai transaksi dipulihkan di halaman Status cluster.`;
    case "COMMIT-SEBAGIAN":
    case "COMMIT-TERTUNDA":
      return `Keputusan COMMIT sudah tercatat, tapi ${daftar} belum menerimanya. Tuntaskan lewat tombol pulihkan di halaman Status cluster.`;
  }
}

/** Mengubah baris `jejak` dari backend menjadi urutan langkah 2PC yang mudah dibaca. */
export function Jejak2PC({
  status,
  gid,
  jejak,
  tertunda = [],
  pesan,
  lipat = false,
  className,
}: {
  status: Status2PC;
  gid: string;
  jejak: string[];
  tertunda?: string[];
  pesan?: string;
  /** true = daftar langkah disembunyikan di balik "Lihat langkah" (hemat tempat) */
  lipat?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-line bg-card", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line-soft px-5 py-3.5">
        <StatusBadge status={status} />
        <span className="text-[13px] text-ink-soft">
          Transaksi <span className="font-medium text-ink">{gid}</span>
        </span>
      </div>
      <div className="px-5 py-4">
        <p className="text-sm text-ink">{pesan ?? penjelasan(status, tertunda)}</p>
        {lipat ? (
          <details className="group mt-3">
            <summary className="cursor-pointer text-[13px] font-medium text-aksen-teks select-none">
              Lihat {jejak.length} langkah 2PC
            </summary>
            <Langkah jejak={jejak} />
          </details>
        ) : (
          <Langkah jejak={jejak} />
        )}
      </div>
    </div>
  );
}

function Langkah({ jejak }: { jejak: string[] }) {
  return (
    <ol className="mt-4 space-y-0">
      {jejak.map((baris, i) => {
        const m = baris.match(/^\[([^\]]+)\]\s*(.*)$/);
        const tag = m?.[1] ?? "";
        const isi = (m?.[2] ?? baris).replaceAll("->", "→");
        const bahaya = tag === "abort" || /gagal|error/i.test(isi);
        const simulasi = tag === "simulasi";
        const mNode = isi.match(/^(pusat|barat|tengah|timur):\s*(.*)$/);
        return (
          <li key={i} className="relative flex gap-3 pb-3 last:pb-0">
            {i < jejak.length - 1 ? (
              <span aria-hidden className="absolute top-5 bottom-0 left-[9px] w-px bg-line" />
            ) : null}
            <span
              aria-hidden
              className={cn(
                "relative mt-0.5 flex size-[19px] shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                bahaya ? "bg-bahaya text-white" : simulasi ? "bg-gantung text-white" : "bg-secondary text-ink",
              )}
            >
              {i + 1}
            </span>
            <div className="min-w-0 text-[13px] leading-relaxed">
              <span className="mr-2 text-ink-soft">{TAG[tag] ?? tag}</span>
              {mNode ? (
                <>
                  <span className={WARNA_NODE[mNode[1] as NodeWilayah | "pusat"]}>{mNode[1]}</span>
                  <span className="text-ink">: {mNode[2]}</span>
                </>
              ) : (
                <span className={cn(bahaya ? "text-bahaya" : simulasi ? "text-gantung" : "text-ink")}>{isi}</span>
              )}
            </div>
          </li>
        );
      })}
</ol>
  );
}

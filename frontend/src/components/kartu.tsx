import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";

/** Kartu standar: judul + sub-judul singkat + isi + legenda titik (pola yang sama di semua halaman). */
export function Kartu({
  judul,
  sub,
  aksi,
  legenda,
  className,
  children,
}: {
  judul: string;
  sub?: string;
  aksi?: React.ReactNode;
  legenda?: { warna: string; label: string }[];
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Panel className={cn("flex flex-col p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">{judul}</h2>
          {sub ? <p className="text-[13px] text-ink-soft">{sub}</p> : null}
        </div>
        {aksi}
      </div>
      <div className="mt-4 flex-1">{children}</div>
      {legenda ? (
        <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-ink-soft">
          {legenda.map((l) => (
            <li key={l.label} className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full" style={{ background: l.warna }} />
              {l.label}
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}

/** Cincin persentase kecil untuk kartu KPI. */
export function Cincin({ rasio, warna, teks, judul }: { rasio: number; warna: string; teks: string; judul?: string }) {
  const r = 19;
  const k = 2 * Math.PI * r;
  return (
    <div className="relative size-12 shrink-0" title={judul}>
      <svg viewBox="0 0 48 48" className="size-12 -rotate-90" aria-hidden>
        <circle cx="24" cy="24" r={r} fill="none" stroke="var(--line-soft)" strokeWidth="5" />
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          stroke={warna}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${Math.min(Math.max(rasio, 0), 1) * k} ${k}`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-ink">{teks}</span>
    </div>
  );
}

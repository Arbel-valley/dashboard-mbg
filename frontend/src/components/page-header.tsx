import type * as React from "react";

/** Judul halaman + satu baris keterangan singkat (opsional) + aksi di kanan. */
export function PageHeader({ judul, sub, aksi }: { judul: string; sub?: React.ReactNode; aksi?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[22px] leading-tight font-semibold tracking-tight text-ink">{judul}</h1>
        {sub ? <p className="mt-1 text-sm text-ink-soft">{sub}</p> : null}
      </div>
      {aksi}
    </div>
  );
}

import * as React from "react";
import { cn } from "@/lib/utils";

/** Wadah berbingkai untuk mengelompokkan konten yang memang satu kesatuan. */
export function Panel({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <section className={cn("rounded-xl border border-line bg-card", className)} {...props} />;
}

export function PanelHeader({
  judul,
  keterangan,
  aksi,
  className,
}: {
  judul: React.ReactNode;
  keterangan?: React.ReactNode;
  aksi?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-3", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-ink">{judul}</h2>
        {keterangan ? <p className="mt-0.5 text-[13px] text-ink-soft">{keterangan}</p> : null}
      </div>
      {aksi}
    </div>
  );
}

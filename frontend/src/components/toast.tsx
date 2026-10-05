"use client";

import { CheckCircle2, Clock, Info, X, XCircle } from "lucide-react";
import Link from "next/link";
import { createContext, useCallback, useContext, useState } from "react";
import { cn } from "@/lib/utils";

export type JenisToast = "sukses" | "gagal" | "gantung" | "info";
export interface IsiToast {
  jenis: JenisToast;
  judul: string;
  isi?: string;
  tautan?: { label: string; href: string };
}
type Toast = IsiToast & { id: number };

const KonteksToast = createContext<(t: IsiToast) => void>(() => {});

/** Tampilkan notifikasi singkat di pojok kanan bawah. */
export function useToast() {
  return useContext(KonteksToast);
}

const IKON = { sukses: CheckCircle2, gagal: XCircle, gantung: Clock, info: Info };
const WARNA = { sukses: "text-barat", gagal: "text-bahaya", gantung: "text-gantung", info: "text-aksen-teks" };

let urut = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [daftar, setDaftar] = useState<Toast[]>([]);

  const tutup = useCallback((id: number) => setDaftar((d) => d.filter((t) => t.id !== id)), []);
  const tampilkan = useCallback(
    (t: IsiToast) => {
      const id = ++urut;
      setDaftar((d) => [...d.slice(-2), { ...t, id }]); // maksimal 3 sekaligus
      setTimeout(() => tutup(id), t.jenis === "gagal" || t.jenis === "gantung" ? 9000 : 5000);
    },
    [tutup],
  );

  return (
    <KonteksToast.Provider value={tampilkan}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">
        {daftar.map((t) => {
          const Ikon = IKON[t.jenis];
          return (
            <div
              key={t.id}
              role="status"
              className="animasi-masuk pointer-events-auto flex gap-3 rounded-xl border border-line bg-card p-3.5 shadow-lg shadow-black/5"
            >
              <Ikon className={cn("mt-0.5 size-4 shrink-0", WARNA[t.jenis])} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{t.judul}</p>
                {t.isi ? <p className="mt-0.5 text-[13px] text-ink-soft">{t.isi}</p> : null}
                {t.tautan ? (
                  <Link href={t.tautan.href} onClick={() => tutup(t.id)} className="mt-1.5 inline-block text-[13px] font-medium text-aksen-teks hover:underline">
                    {t.tautan.label}
                  </Link>
                ) : null}
              </div>
              <button type="button" onClick={() => tutup(t.id)} aria-label="Tutup notifikasi" className="self-start rounded p-0.5 text-ink-soft hover:text-ink">
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </KonteksToast.Provider>
  );
}

"use client";

import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { ErrorState } from "@/components/error-state";
import { NodeBadge } from "@/components/node-badge";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { aturFilterNode, denganNode, useFilterNode } from "@/lib/filter-node";
import { angka, LABEL_KATEGORI, nodeDariFragmen } from "@/lib/format";
import { useWilayah } from "@/lib/hooks";
import { NODE } from "@/lib/node";
import type { DaftarPenduduk } from "@/lib/types";
import { cn } from "@/lib/utils";

const UKURAN = [20, 50, 100];

export default function HalamanPenduduk() {
  const router = useRouter();
  const filter = useFilterNode();
  const { peta } = useWilayah();
  const [ketik, setKetik] = useState("");
  const [cari, setCari] = useState("");
  const [ukuran, setUkuran] = useState(50);

  // Debounce: request baru dikirim 300 ms setelah berhenti mengetik.
  useEffect(() => {
    const t = setTimeout(() => setCari(ketik.trim()), 300);
    return () => clearTimeout(t);
  }, [ketik]);

  // Halaman otomatis kembali ke 0 saat filter/kata kunci/ukuran berubah (tanpa effect tambahan).
  const kunci = `${filter}|${cari}|${ukuran}`;
  const [hal, setHal] = useState({ kunci, n: 0 });
  const halaman = hal.kunci === kunci ? hal.n : 0;

  const path = denganNode(
    `/penduduk?limit=${ukuran}&offset=${halaman * ukuran}${cari ? `&q=${encodeURIComponent(cari)}` : ""}`,
    filter,
  );
  const { data, error, isValidating, mutate } = useSWR<DaftarPenduduk>(path, { keepPreviousData: true });
  const total = data?.total ?? 0;
  const halTerakhir = Math.max(0, Math.ceil(total / ukuran) - 1);

  return (
    <>
      <PageHeader
        judul="Penduduk"
        sub={data ? `${angka(total)} penduduk${filter !== "semua" ? ` di node ${filter}` : ""}` : "Memuat..."}
        aksi={
          <Link href="/registrasi" className={buttonVariants()}>
            Daftarkan penduduk
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-soft" aria-hidden />
          <label htmlFor="cari" className="sr-only">
            Cari nama atau NIM
          </label>
          <input
            id="cari"
            value={ketik}
            onChange={(e) => setKetik(e.target.value)}
            placeholder="Cari nama atau NIM"
            className="h-9 w-full rounded-lg border border-input bg-card pr-3 pl-9 text-sm text-ink placeholder:text-ink-soft"
          />
        </div>
        {filter !== "semua" ? (
          <span className="inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-[13px] text-ink">
            <span aria-hidden className={cn("size-2 rounded-full", NODE[filter].bg)} />
            Hanya node {filter} yang ditanya
            <button type="button" onClick={() => aturFilterNode("semua")} aria-label="Hapus filter node" className="text-ink-soft hover:text-ink">
              <X className="size-3.5" aria-hidden />
            </button>
          </span>
        ) : null}
      </div>

      {error && !data ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : (
        <Panel className={cn("overflow-hidden transition-opacity", isValidating && data ? "opacity-70" : "")}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-line text-left text-[13px] text-ink-soft">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">NIM</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Nama</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Provinsi</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Sasaran MBG</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Tersimpan di</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {!data
                  ? Array.from({ length: 10 }, (_, i) => (
                      <tr key={i}>
                        <td colSpan={5} className="px-4 py-3">
                          <Skeleton className="h-4" />
                        </td>
                      </tr>
                    ))
                  : data.baris.map((b) => (
                      <tr key={b.nim} className="cursor-pointer hover:bg-sidebar" onClick={() => router.push(`/penduduk/${b.nim}`)}>
                        <td className="px-4 py-2.5">
                          <Link href={`/penduduk/${b.nim}`} className="font-medium text-ink hover:underline">
                            {b.nim}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-ink">{b.nama}</td>
                        <td className="px-4 py-2.5 text-ink">{peta.get(b.kode_provinsi)?.nama_provinsi ?? b.kode_provinsi}</td>
                        <td className="px-4 py-2.5">
                          <span className="flex flex-wrap gap-1">
                            {b.kategori_mbg.length ? b.kategori_mbg.map((k) => <Badge key={k}>{LABEL_KATEGORI[k]}</Badge>) : <span className="text-ink-soft">-</span>}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <NodeBadge node={nodeDariFragmen(b.fragmen)} />
                        </td>
                      </tr>
                    ))}
                {data && data.baris.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-ink-soft">
                      Tidak ada penduduk yang cocok.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-[13px] text-ink-soft">
            <span>
              {total ? `${angka(halaman * ukuran + 1)}–${angka(Math.min(total, (halaman + 1) * ukuran))} dari ${angka(total)}` : "0 hasil"}
            </span>
            <div className="flex items-center gap-2">
              <label htmlFor="ukuran" className="sr-only">
                Baris per halaman
              </label>
              <select
                id="ukuran"
                value={ukuran}
                onChange={(e) => setUkuran(Number(e.target.value))}
                className="h-8 rounded-lg border border-input bg-card pr-7 pl-2 text-[13px] text-ink"
              >
                {UKURAN.map((n) => (
                  <option key={n} value={n}>
                    {n} / halaman
                  </option>
                ))}
              </select>
              <Button
                variant="secondary"
                size="sm"
                aria-label="Halaman sebelumnya"
                disabled={halaman === 0}
                onClick={() => setHal({ kunci, n: halaman - 1 })}
                className="px-2"
              >
                <ChevronLeft />
              </Button>
              <span className="min-w-16 text-center">
                {halaman + 1} / {halTerakhir + 1}
              </span>
              <Button
                variant="secondary"
                size="sm"
                aria-label="Halaman berikutnya"
                disabled={halaman >= halTerakhir}
                onClick={() => setHal({ kunci, n: halaman + 1 })}
                className="px-2"
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        </Panel>
      )}
    </>
  );
}

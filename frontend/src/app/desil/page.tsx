"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import useSWR, { useSWRConfig } from "swr";
import { ErrorState } from "@/components/error-state";
import { HasilTransaksi, type HasilKirim, ringkasHasil } from "@/components/hasil-transaksi";
import { Kartu } from "@/components/kartu";
import { PageHeader } from "@/components/page-header";
import { PilihSimulasi } from "@/components/pilih-simulasi";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { denganSimulasi, kirim } from "@/lib/api";
import { angka } from "@/lib/format";
import { NODE, NODE_WILAYAH } from "@/lib/node";
import { useTema, warnaGrafik } from "@/lib/tampilan";
import type { Hasil2PC, Program, RingkasanDesil } from "@/lib/types";

/** Program berbasis desil yang berlaku untuk desil d (dari aturan di ref_program). */
const programUntuk = (d: number, program: Program[]) =>
  program.filter((p) => p.basis === "desil" && p.desil_maks != null && d <= p.desil_maks);

export default function HalamanDesil() {
  const { data, error, mutate } = useSWR<RingkasanDesil>("/dashboard/desil");
  const w = warnaGrafik(useTema());
  const program = data?.kelayakan_program ?? [];
  const jumlahProgramDesil = program.filter((p) => p.basis === "desil").length;
  const warna = (d: number) => {
    const n = programUntuk(d, program).length;
    return n === 0 ? w.lemah : n === jumlahProgramDesil ? "#6366f1" : "#a5b4fc";
  };
  const total = (data?.distribusi ?? []).reduce((s, b) => s + b.jumlah, 0);

  return (
    <>
      <PageHeader judul="Desil & program" sub="Peringkat kesejahteraan nasional, dihitung dari tiga node" />
      {error && !data ? <ErrorState error={error} onRetry={() => mutate()} /> : null}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <Kartu
            judul="Sebaran per desil"
            sub={data && total ? `${angka(total)} penduduk` : "Belum dihitung"}
            legenda={
              data?.distribusi.length
                ? [
                    { warna: "#6366f1", label: "Semua bansos" },
                    { warna: "#a5b4fc", label: "Sebagian" },
                    { warna: w.lemah, label: "Tidak menerima" },
                  ]
                : undefined
            }
          >
            {!data ? (
              <Skeleton className="h-[260px]" />
            ) : data.distribusi.length === 0 ? (
              <p className="py-24 text-center text-sm text-ink-soft">Tekan Hitung desil di samping.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.distribusi} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid vertical={false} stroke={w.grid} />
                  <XAxis dataKey="desil" tickLine={false} axisLine={false} tick={{ fill: w.tick, fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: w.tick, fontSize: 12 }} />
                  <Tooltip
                    cursor={{ fill: w.kursor }}
                    contentStyle={w.tooltip}
                    separator=""
                    formatter={(v) => [`${angka(Number(v))} penduduk`, ""]}
                    labelFormatter={(d) => {
                      const ps = programUntuk(Number(d), program).map((p) => p.kode.replace("_", " "));
                      return `Desil ${d}${ps.length ? `: ${ps.join(", ")}` : ""}`;
                    }}
                  />
                  <Bar dataKey="jumlah" radius={[3, 3, 0, 0]} maxBarSize={36}>
                    {data.distribusi.map((b) => (
                      <Cell key={b.desil} fill={warna(b.desil)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Kartu>

          <Kartu judul="Aturan program" sub="Dari tabel referensi pusat">
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="border-b border-line text-left text-[13px] text-ink-soft">
                  <tr>
                    <th scope="col" className="px-1 py-2 font-medium">Program</th>
                    <th scope="col" className="px-1 py-2 font-medium">Syarat</th>
                    <th scope="col" className="px-1 py-2 text-right font-medium">Layak</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {program.map((p) => (
                    <tr key={p.kode}>
                      <td className="px-1 py-2.5">
                        <p className="text-ink">{p.nama}</p>
                        {p.dasar_hukum ? <p className="text-xs text-ink-soft">{p.dasar_hukum}</p> : null}
                      </td>
                      <td className="px-1 py-2.5 text-ink">{p.basis === "desil" ? `Desil 1–${p.desil_maks}` : "Kategori sasaran"}</td>
                      <td className="px-1 py-2.5 text-right font-semibold text-ink">{p.jumlah_layak == null ? "-" : angka(p.jumlah_layak)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Kartu>
        </div>

        <HitungDesil onSelesai={() => mutate()} />
      </div>
    </>
  );
}

function HitungDesil({ onSelesai }: { onSelesai: () => void }) {
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const [simulasi, setSimulasi] = useState("");
  const [proses, setProses] = useState(false);
  const [hasil, setHasil] = useState<HasilKirim>(null);

  async function hitung() {
    setProses(true);
    setHasil(null);
    let h: Exclude<HasilKirim, null>;
    try {
      const data = await kirim<Hasil2PC>(denganSimulasi("/desil/hitung", simulasi));
      h = { ok: true, data };
      onSelesai();
      mutate((k) => typeof k === "string" && (k.startsWith("/dashboard") || k.startsWith("/penduduk/")));
    } catch (error) {
      h = { ok: false, error };
    }
    setHasil(h);
    toast(ringkasHasil(h, "Desil nasional diperbarui"));
    setProses(false);
  }

  const d = hasil?.ok ? hasil.data : null;

  return (
    <aside className="space-y-4 lg:sticky lg:top-6">
      <Kartu judul="Hitung desil" sub="2PC ke tiga node">
        <div className="space-y-3.5">
          <PilihSimulasi id="simulasi-desil" value={simulasi} onChange={setSimulasi} />
          <Button className="w-full" onClick={hitung} disabled={proses}>
            {proses ? "Menghitung..." : "Hitung desil nasional"}
          </Button>
        </div>
        {d?.skor_per_node && d.cutoff_desil ? (
          <div className="mt-4 space-y-3 border-t border-line pt-4 text-[13px]">
            <ul className="space-y-1.5">
              {NODE_WILAYAH.map((n) => (
                <li key={n} className="flex items-center gap-2">
                  <span aria-hidden className={`size-2 rounded-full ${NODE[n].bg}`} />
                  <span className="flex-1 text-ink">{NODE[n].nama}</span>
                  <span className="text-ink-soft">{angka(d.skor_per_node?.[n])} skor</span>
                </li>
              ))}
            </ul>
            <div>
              <p className="mb-1.5 text-ink-soft">Batas antar desil</p>
              <p className="flex flex-wrap gap-1">
                {d.cutoff_desil.map((c, i) => (
                  <span key={i} className="rounded bg-secondary px-1.5 py-0.5 text-ink">
                    {c.toLocaleString("id-ID")}
                  </span>
                ))}
              </p>
            </div>
          </div>
        ) : null}
      </Kartu>
      <HasilTransaksi hasil={hasil} />
    </aside>
  );
}

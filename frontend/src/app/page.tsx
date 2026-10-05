"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import useSWR from "swr";
import { ErrorState } from "@/components/error-state";
import { Cincin, Kartu } from "@/components/kartu";
import { buttonVariants } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { denganNode, type FilterNode, useFilterNode } from "@/lib/filter-node";
import { angka, LABEL_KATEGORI, persen, rupiah, URUTAN_KATEGORI } from "@/lib/format";
import { NODE, NODE_WILAYAH } from "@/lib/node";
import { useTema, warnaGrafik } from "@/lib/tampilan";
import type { BarisRingkasan, KategoriMBG, Ringkasan, RingkasanDesil, StatusCluster } from "@/lib/types";
import { cn } from "@/lib/utils";

const kolomMBG = (k: KategoriMBG) => `mbg_${k}` as keyof BarisRingkasan;
const totalMBG = (b: BarisRingkasan) => URUTAN_KATEGORI.reduce((n, k) => n + (b[kolomMBG(k)] as number), 0);

/** Gaya sumbu & tooltip Recharts yang mengikuti tema aktif. */
function useGayaGrafik() {
  const w = warnaGrafik(useTema());
  return {
    w,
    sumbu: { tickLine: false, axisLine: false, tick: { fill: w.tick, fontSize: 11 } } as const,
    tooltip: { cursor: { fill: w.kursor }, contentStyle: w.tooltip } as const,
  };
}

export default function HalamanRingkasan() {
  const filter = useFilterNode();
  const { data, error, mutate } = useSWR<Ringkasan>("/dashboard/ringkasan", { refreshInterval: 15000 });
  const desil = useSWR<RingkasanDesil>(denganNode("/dashboard/desil", filter));
  const status = useSWR<StatusCluster>("/status", { refreshInterval: 5000 });
  const { w } = useGayaGrafik(); // hook: wajib sebelum return lebih awal

  if (error && !data) return <ErrorState error={error} onRetry={() => mutate()} />;

  const semua = data?.baris ?? [];
  const baris = filter === "semua" ? semua : semua.filter((b) => b.node === filter);
  const memuat = !data;
  const total = baris.reduce((n, b) => n + b.jumlah_penduduk, 0);
  const miskin = baris.reduce((n, b) => n + b.di_bawah_garis_kemiskinan, 0);
  const mbg = baris.reduce((n, b) => n + totalMBG(b), 0);
  const pkh = desil.data?.kelayakan_program.find((p) => p.kode === "PKH");
  const nodeHidup = status.data ? NODE_WILAYAH.filter((n) => status.data![n].hidup).length : 3;
  const legendaNode = NODE_WILAYAH.map((n) => ({ warna: NODE[n].fill, label: NODE[n].nama }));

  return (
    <div className="space-y-5">
      {data?.mode === "parsial" ? (
        <p role="status" className="rounded-lg border border-bahaya/30 bg-bahaya-soft px-4 py-2.5 text-sm text-bahaya">
          Node {data.node_tidak_tersedia?.join(", ")} tidak terjangkau. Data belum lengkap.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KartuKPI memuat={memuat} nilai={angka(total)} label="Penduduk terdata" rasio={nodeHidup / 3} teks={`${nodeHidup}/3`} judulCincin="Node aktif" warna={nodeHidup === 3 ? "#10b981" : "#dc2626"} />
        <KartuKPI memuat={memuat} nilai={angka(miskin)} label="Di bawah garis kemiskinan" rasio={total ? miskin / total : 0} warna="#f43f5e" />
        <KartuKPI
          memuat={memuat || !desil.data}
          nilai={pkh?.jumlah_layak != null ? angka(pkh.jumlah_layak) : "-"}
          label="Layak PKH & BPNT"
          rasio={total && pkh?.jumlah_layak ? pkh.jumlah_layak / total : 0}
          warna="#6366f1"
        />
        <KartuKPI memuat={memuat} nilai={angka(mbg)} label="Sasaran MBG" rasio={total ? mbg / total : 0} warna="#f59e0b" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Kartu judul="Penduduk per provinsi" sub="Barat ke timur" legenda={filter === "semua" ? legendaNode : legendaNode.filter((l) => l.label === NODE[filter].nama)}>
          {memuat ? <Skeleton className="h-[240px]" /> : <GrafikProvinsi baris={baris} />}
        </Kartu>
        <Kartu
          judul="Desil kesejahteraan"
          sub={filter === "semua" ? "Distribusi nasional" : `Penduduk node ${filter}`}
          legenda={[
            { warna: "#6366f1", label: "Layak bansos" },
            { warna: w.lemah, label: "Tidak layak" },
          ]}
        >
          <GrafikDesil data={desil.data} gagal={!!desil.error} />
        </Kartu>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Kartu judul="Sebaran data" sub="Per node wilayah">
          <SebaranNode baris={semua} memuat={memuat} status={status.data} sorot={filter} />
        </Kartu>
        <Kartu judul="Sasaran MBG" sub="Per kategori">
          <SasaranMBG baris={baris} memuat={memuat} />
        </Kartu>
        <Kartu judul="Kemiskinan" sub="Persentase per node" legenda={legendaNode}>
          {memuat ? <Skeleton className="h-[180px]" /> : <GrafikKemiskinan baris={semua} sorot={filter} />}
        </Kartu>
      </div>

      <PerProvinsi baris={baris} memuat={memuat} />
    </div>
  );
}

function KartuKPI({
  nilai,
  label,
  rasio,
  teks,
  warna,
  judulCincin,
  memuat,
}: {
  nilai: string;
  label: string;
  rasio: number;
  teks?: string;
  warna: string;
  judulCincin?: string;
  memuat: boolean;
}) {
  return (
    <Panel className="flex items-center gap-4 px-5 py-4">
      {memuat ? (
        <Skeleton className="size-12 rounded-full" />
      ) : (
        <Cincin rasio={rasio} warna={warna} teks={teks ?? `${Math.round(rasio * 100)}%`} judul={judulCincin} />
      )}
      <div className="min-w-0">
        <p className="text-xl leading-tight font-bold text-ink">{memuat ? "-" : nilai}</p>
        <p className="truncate text-[13px] text-ink-soft">{label}</p>
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------------ grafik
function GrafikProvinsi({ baris }: { baris: BarisRingkasan[] }) {
  const { w, sumbu, tooltip } = useGayaGrafik();
  const data = baris.toSorted((a, b) => a.kode_provinsi - b.kode_provinsi); // kira-kira barat -> timur
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
        <CartesianGrid vertical={false} stroke={w.grid} />
        <XAxis dataKey="kode_provinsi" {...sumbu} interval={data.length > 20 ? 3 : 0} />
        <YAxis {...sumbu} />
        <Tooltip
          {...tooltip}
          labelFormatter={(_, p) => (p?.[0]?.payload as BarisRingkasan | undefined)?.nama_provinsi ?? ""}
          formatter={(v) => [`${angka(Number(v))} penduduk`, ""]}
          separator=""
        />
        <Bar dataKey="jumlah_penduduk" radius={[3, 3, 0, 0]} maxBarSize={14}>
          {data.map((b) => (
            <Cell key={b.kode_provinsi} fill={NODE[b.node].fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function GrafikDesil({ data, gagal }: { data?: RingkasanDesil; gagal: boolean }) {
  const { w, sumbu, tooltip } = useGayaGrafik();
  if (gagal) return <p className="py-20 text-center text-sm text-bahaya">Desil butuh ketiga node.</p>;
  if (!data) return <Skeleton className="h-[240px]" />;
  if (data.distribusi.length === 0) {
    return (
      <div className="flex h-[240px] flex-col items-center justify-center gap-3">
        <p className="text-sm text-ink-soft">Desil belum dihitung.</p>
        <Link href="/desil" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          Hitung desil
        </Link>
      </div>
    );
  }
  const batas = Math.max(0, ...data.kelayakan_program.filter((p) => p.basis === "desil").map((p) => p.desil_maks ?? 0));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data.distribusi} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
        <CartesianGrid vertical={false} stroke={w.grid} />
        <XAxis dataKey="desil" {...sumbu} />
        <YAxis {...sumbu} />
        <Tooltip {...tooltip} labelFormatter={(d) => `Desil ${d}`} formatter={(v) => [`${angka(Number(v))} penduduk`, ""]} separator="" />
        <Bar dataKey="jumlah" radius={[3, 3, 0, 0]} maxBarSize={28}>
          {data.distribusi.map((d) => (
            <Cell key={d.desil} fill={d.desil <= batas ? "#6366f1" : w.lemah} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function GrafikKemiskinan({ baris, sorot }: { baris: BarisRingkasan[]; sorot: FilterNode }) {
  const { w, sumbu, tooltip } = useGayaGrafik();
  const data = NODE_WILAYAH.map((n) => {
    const b = baris.filter((x) => x.node === n);
    const p = b.reduce((s, x) => s + x.jumlah_penduduk, 0);
    const m = b.reduce((s, x) => s + x.di_bawah_garis_kemiskinan, 0);
    return { n, node: NODE[n].nama, rasio: p ? m / p : 0 };
  });
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <CartesianGrid vertical={false} stroke={w.grid} />
        <XAxis dataKey="node" {...sumbu} />
        <YAxis {...sumbu} domain={[0, 0.3]} ticks={[0, 0.1, 0.2, 0.3]} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
        <Tooltip {...tooltip} formatter={(v) => [persen(Number(v), 1), ""]} separator="" />
        <Bar dataKey="rasio" radius={[3, 3, 0, 0]} maxBarSize={36}>
          {data.map((d) => (
            <Cell key={d.n} fill={NODE[d.n].fill} fillOpacity={sorot === "semua" || sorot === d.n ? 1 : 0.25} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ------------------------------------------------------------------ kartu kecil
function SebaranNode({
  baris,
  memuat,
  status,
  sorot,
}: {
  baris: BarisRingkasan[];
  memuat: boolean;
  status?: StatusCluster;
  sorot: FilterNode;
}) {
  const perNode = NODE_WILAYAH.map((n) => ({
    n,
    jumlah: baris.filter((b) => b.node === n).reduce((s, b) => s + b.jumlah_penduduk, 0),
    hidup: status ? status[n].hidup : true,
  }));
  const total = perNode.reduce((s, x) => s + x.jumlah, 0);
  if (memuat) return <Skeleton className="h-[180px]" />;
  const redup = (n: string) => sorot !== "semua" && sorot !== n;
  return (
    <div>
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
        {perNode.map(({ n, jumlah, hidup }) => (
          <span
            key={n}
            className={cn(hidup ? NODE[n].bg : "arsir-mati", redup(n) && "opacity-25")}
            style={{ flexGrow: Math.max(jumlah, 1), flexBasis: 0 }}
          />
        ))}
      </div>
      <ul className="mt-5 space-y-3.5">
        {perNode.map(({ n, jumlah, hidup }) => (
          <li key={n} className={cn("flex items-center gap-2.5 text-sm", redup(n) && "opacity-40")}>
            <span aria-hidden className={cn("size-2 rounded-full", hidup ? NODE[n].bg : "bg-bahaya")} />
            <span className="flex-1 text-ink">{NODE[n].nama}</span>
            {hidup ? (
              <>
                <span className="font-semibold text-ink">{angka(jumlah)}</span>
                <span className="w-12 text-right text-ink-soft">{persen(jumlah, total)}</span>
              </>
            ) : (
              <span className="text-bahaya">Mati</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SasaranMBG({ baris, memuat }: { baris: BarisRingkasan[]; memuat: boolean }) {
  const jumlah = URUTAN_KATEGORI.map((k) => ({ k, n: baris.reduce((s, b) => s + (b[kolomMBG(k)] as number), 0) }));
  const maks = Math.max(1, ...jumlah.map((x) => x.n));
  if (memuat) return <Skeleton className="h-[180px]" />;
  return (
    <ul className="space-y-3">
      {jumlah.map(({ k, n }) => (
        <li key={k} className="text-sm">
          <div className="mb-1 flex justify-between">
            <span className="text-ink">{LABEL_KATEGORI[k]}</span>
            <span className="font-semibold text-ink">{angka(n)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-line-soft">
            <div className="h-full rounded-full bg-[#f59e0b]" style={{ width: `${(n / maks) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ tabel per provinsi
type Kunci = "nama_provinsi" | "jumlah_penduduk" | "penghasilan_per_kapita" | "persen_miskin" | "mbg";
type Urutan = { kunci: Kunci; turun: boolean };

function KepalaKolom({
  kunci,
  urut,
  setUrut,
  kanan,
  children,
}: {
  kunci: Kunci;
  urut: Urutan;
  setUrut: (u: Urutan) => void;
  kanan?: boolean;
  children: React.ReactNode;
}) {
  const aktif = urut.kunci === kunci;
  return (
    <th
      scope="col"
      aria-sort={aktif ? (urut.turun ? "descending" : "ascending") : "none"}
      className={cn("px-3 py-2.5 font-medium", kanan && "text-right")}
    >
      <button
        type="button"
        onClick={() => setUrut({ kunci, turun: aktif ? !urut.turun : kunci !== "nama_provinsi" })}
        className={cn("inline-flex items-center gap-1 hover:text-ink", aktif ? "text-ink" : "text-ink-soft")}
      >
        {children}
        <span aria-hidden className="text-[9px]">
          {aktif ? (urut.turun ? "▼" : "▲") : ""}
        </span>
      </button>
    </th>
  );
}

function PerProvinsi({ baris, memuat }: { baris: BarisRingkasan[]; memuat: boolean }) {
  const [urut, setUrut] = useState<Urutan>({ kunci: "jumlah_penduduk", turun: true });

  const tampil = useMemo(() => {
    const nilai = (b: BarisRingkasan): number | string => {
      switch (urut.kunci) {
        case "nama_provinsi":
          return b.nama_provinsi;
        case "persen_miskin":
          return b.jumlah_penduduk ? b.di_bawah_garis_kemiskinan / b.jumlah_penduduk : 0;
        case "mbg":
          return totalMBG(b);
        default:
          return b[urut.kunci] ?? 0;
      }
    };
    return baris.toSorted((a, b) => {
      const x = nilai(a);
      const y = nilai(b);
      const c = typeof x === "string" ? x.localeCompare(y as string, "id") : x - (y as number);
      return urut.turun ? -c : c;
    });
  }, [baris, urut]);

  return (
    <Kartu judul="Per provinsi" sub={`${baris.length} provinsi`} className="px-3 pb-2">
      <div className="-mx-1 max-h-[440px] overflow-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead className="sticky top-0 border-b border-line bg-card text-left text-[13px]">
            <tr>
              <KepalaKolom kunci="nama_provinsi" urut={urut} setUrut={setUrut}>Provinsi</KepalaKolom>
              <KepalaKolom kunci="jumlah_penduduk" urut={urut} setUrut={setUrut} kanan>Penduduk</KepalaKolom>
              <KepalaKolom kunci="penghasilan_per_kapita" urut={urut} setUrut={setUrut} kanan>Per kapita</KepalaKolom>
              <KepalaKolom kunci="persen_miskin" urut={urut} setUrut={setUrut} kanan>Miskin</KepalaKolom>
              <KepalaKolom kunci="mbg" urut={urut} setUrut={setUrut} kanan>Sasaran MBG</KepalaKolom>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {memuat
              ? Array.from({ length: 6 }, (_, i) => (
                  <tr key={i}>
                    <td colSpan={5} className="px-3 py-2.5">
                      <Skeleton className="h-4" />
                    </td>
                  </tr>
                ))
              : tampil.map((b) => (
                  <tr key={b.kode_provinsi} className="hover:bg-sidebar">
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-2 text-ink">
                        <span aria-hidden className={cn("size-2 rounded-full", NODE[b.node].bg)} />
                        {b.nama_provinsi}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-ink">{angka(b.jumlah_penduduk)}</td>
                    <td className="px-3 py-2.5 text-right text-ink">{rupiah(b.penghasilan_per_kapita)}</td>
                    <td className="px-3 py-2.5 text-right text-ink">
                      {angka(b.di_bawah_garis_kemiskinan)}{" "}
                      <span className="text-ink-soft">({persen(b.di_bawah_garis_kemiskinan, b.jumlah_penduduk)})</span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-ink">{angka(totalMBG(b))}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </Kartu>
  );
}

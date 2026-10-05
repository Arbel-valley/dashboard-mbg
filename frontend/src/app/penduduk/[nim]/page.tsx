"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { ErrorState } from "@/components/error-state";
import { HasilTransaksi, type HasilKirim, ringkasHasil } from "@/components/hasil-transaksi";
import { Kartu } from "@/components/kartu";
import { PageHeader } from "@/components/page-header";
import { PilihProvinsi } from "@/components/pilih-provinsi";
import { PilihSimulasi } from "@/components/pilih-simulasi";
import { useToast } from "@/components/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { denganSimulasi, kirim } from "@/lib/api";
import { angka, label, LABEL_KATEGORI, rupiah, tanggal, umur } from "@/lib/format";
import { useWilayah } from "@/lib/hooks";
import { NODE } from "@/lib/node";
import type { DataPenduduk, DetailPenduduk, Hasil2PC, NodeWilayah, RingkasanDesil } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function HalamanDetailPenduduk() {
  const { nim } = useParams<{ nim: string }>();
  const { data, error, mutate } = useSWR<DetailPenduduk>(`/penduduk/${nim}`);
  const { peta } = useWilayah();

  const kembali = (
    <Link href="/penduduk" className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-ink-soft hover:text-ink">
      <ArrowLeft className="size-4" aria-hidden /> Penduduk
    </Link>
  );

  if (error && !data) {
    return (
      <>
        {kembali}
        <PageHeader judul={`NIM ${nim}`} />
        <ErrorState error={error} onRetry={() => mutate()} />
      </>
    );
  }
  if (!data) {
    return (
      <>
        {kembali}
        <Skeleton className="mb-2 h-7 w-64" />
        <Skeleton className="mb-6 h-4 w-80" />
        <Skeleton className="h-64" />
      </>
    );
  }

  const d = data.data;
  const node = data.lokasi.node;
  const provinsi = peta.get(d.kode_provinsi)?.nama_provinsi ?? `Provinsi ${d.kode_provinsi}`;

  return (
    <>
      {kembali}
      <PageHeader judul={d.nama} sub={`NIM ${d.nim}, ${d.jenis_kelamin === "L" ? "laki-laki" : "perempuan"}, ${umur(d.tanggal_lahir)}, ${provinsi}`} />

      <JalurBaca direktori={data.lokasi.direktori_dibaca_dari} node={node} />

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          <Kartu judul="Identitas" sub="Fragmen identitas">
            <Daftar
              isi={[
                ["Tanggal lahir", tanggal(d.tanggal_lahir)],
                ["Alamat", d.alamat ?? "-"],
                ["Provinsi", `${provinsi} (${d.kode_provinsi})`],
                [
                  "Sasaran MBG",
                  d.kategori_mbg.length ? (
                    <span className="flex flex-wrap gap-1">
                      {d.kategori_mbg.map((k) => (
                        <Badge key={k}>{LABEL_KATEGORI[k]}</Badge>
                      ))}
                    </span>
                  ) : (
                    "-"
                  ),
                ],
              ]}
            />
          </Kartu>
          <Kartu judul="Sosial-ekonomi" sub="Fragmen sosek, bisa dibaca akun AI">
            <Daftar
              isi={[
                ["Penghasilan rumah tangga", `${rupiah(d.penghasilan_bulanan)} / bulan`],
                ["Anggota rumah tangga", `${d.jumlah_art} orang`],
                ["Per kapita", `${rupiah(d.penghasilan_per_kapita)} / bulan`],
                ["Wilayah", d.perkotaan ? "Perkotaan" : "Perdesaan"],
                ["Pekerjaan KK", label(d.pekerjaan_kk)],
                ["Pendidikan KK", label(d.pendidikan_kk)],
                ["Rumah", `${angka(d.luas_lantai_m2)} m², lantai ${d.jenis_lantai}`],
                ["Air minum", label(d.sumber_air)],
                ["Listrik", `${angka(d.daya_listrik_va)} VA`],
                ["Aset", aset(d)],
              ]}
            />
          </Kartu>
        </div>

        <div className="space-y-5">
          <Kelayakan data={d} />
          <PindahDomisili nim={d.nim} nodeAsal={node} kodeAsal={d.kode_provinsi} onSelesai={() => mutate()} />
        </div>
      </div>
    </>
  );
}

function aset(d: DataPenduduk) {
  const a = [d.punya_motor && "motor", d.punya_mobil && "mobil", d.punya_lahan && "lahan"].filter(Boolean);
  return a.length ? a.join(", ") : "-";
}

function Daftar({ isi }: { isi: [string, React.ReactNode][] }) {
  return (
    <dl className="divide-y divide-line-soft">
      {isi.map(([k, v]) => (
        <div key={k} className="grid gap-1 py-2 sm:grid-cols-[12rem_1fr]">
          <dt className="text-[13px] text-ink-soft">{k}</dt>
          <dd className="text-sm text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Jalur baca: katalog global di pusat -> node pemilik data. */
function JalurBaca({ direktori, node }: { direktori: string; node: NodeWilayah }) {
  return (
    <ol aria-label="Jalur baca data" className="flex flex-wrap items-center gap-2 text-[13px]">
      <li className="rounded-lg border border-line px-3 py-1.5 text-ink">Direktori di {direktori}</li>
      <li aria-hidden className="text-ink-soft">
        <ArrowRight className="size-4" />
      </li>
      <li className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-ink">
        <span aria-hidden className={cn("size-2 rounded-full", NODE[node].bg)} />
        Data di node {node}
      </li>
    </ol>
  );
}

function Kelayakan({ data }: { data: DataPenduduk }) {
  const { data: desil } = useSWR<RingkasanDesil>("/dashboard/desil");
  const program = desil?.kelayakan_program ?? [];
  return (
    <Kartu judul="Kelayakan program" sub={data.desil == null ? "Desil belum dihitung" : `Skor ${data.skor?.toLocaleString("id-ID")}`}>
      {data.desil != null ? <p className="mb-3 text-3xl font-bold text-ink">Desil {data.desil}</p> : null}
      <ul className="space-y-2">
        {program.map((p) => {
          const layak =
            p.basis === "desil"
              ? data.desil != null && p.desil_maks != null && data.desil <= p.desil_maks
              : data.kategori_mbg.length > 0;
          return (
            <li key={p.kode} className="flex items-center justify-between gap-3 text-sm">
              <span className={layak ? "text-ink" : "text-ink-soft"}>{p.nama}</span>
              {layak ? <Badge variant="commit">Layak</Badge> : <Badge variant="garis">Tidak</Badge>}
            </li>
          );
        })}
      </ul>
    </Kartu>
  );
}

function PindahDomisili({
  nim,
  nodeAsal,
  kodeAsal,
  onSelesai,
}: {
  nim: string;
  nodeAsal: NodeWilayah;
  kodeAsal: number;
  onSelesai: () => void;
}) {
  const { peta } = useWilayah();
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const [tujuan, setTujuan] = useState("");
  const [alamat, setAlamat] = useState("");
  const [wilayah, setWilayah] = useState("");
  const [simulasi, setSimulasi] = useState("");
  const [proses, setProses] = useState(false);
  const [hasil, setHasil] = useState<HasilKirim>(null);

  const nodeTujuan = tujuan ? peta.get(Number(tujuan))?.node : undefined;

  async function pindahkan(e: React.FormEvent) {
    e.preventDefault();
    setProses(true);
    setHasil(null);
    let h: Exclude<HasilKirim, null>;
    try {
      const data = await kirim<Hasil2PC>(denganSimulasi(`/penduduk/${nim}/pindah`, simulasi), {
        kode_provinsi_baru: Number(tujuan),
        alamat_baru: alamat.trim() || null,
        perkotaan_baru: wilayah === "" ? null : wilayah === "kota",
      });
      h = { ok: true, data };
      onSelesai();
      mutate((k) => typeof k === "string" && (k.startsWith("/penduduk") || k.startsWith("/dashboard")));
    } catch (error) {
      h = { ok: false, error };
    }
    setHasil(h);
    toast(ringkasHasil(h, "Domisili dipindahkan"));
    setProses(false);
  }

  return (
    <Kartu
      judul="Pindah domisili"
      sub={
        nodeTujuan
          ? nodeTujuan === nodeAsal
            ? "Node sama: 2 peserta 2PC"
            : `Node ${nodeAsal} ke ${nodeTujuan}: 3 peserta 2PC`
          : "Transaksi 2PC lintas node"
      }
    >
      <form onSubmit={pindahkan} className="space-y-3.5">
        <Field label="Provinsi tujuan" htmlFor="tujuan">
          <PilihProvinsi id="tujuan" value={tujuan} onChange={setTujuan} required />
        </Field>
        <Field label="Alamat baru" htmlFor="alamat">
          <Input id="alamat" placeholder="Opsional" value={alamat} onChange={(e) => setAlamat(e.target.value)} />
        </Field>
        <Field label="Wilayah" htmlFor="wilayah">
          <Select id="wilayah" value={wilayah} onChange={(e) => setWilayah(e.target.value)}>
            <option value="">Tetap</option>
            <option value="kota">Perkotaan</option>
            <option value="desa">Perdesaan</option>
          </Select>
        </Field>
        <PilihSimulasi id="simulasi-pindah" value={simulasi} onChange={setSimulasi} />
        <Button type="submit" className="w-full" disabled={!tujuan || Number(tujuan) === kodeAsal || proses}>
          {proses ? "Memindahkan..." : "Pindahkan"}
        </Button>
      </form>
      {hasil ? (
        <div className="mt-4">
          <HasilTransaksi hasil={hasil} />
        </div>
      ) : null}
    </Kartu>
  );
}

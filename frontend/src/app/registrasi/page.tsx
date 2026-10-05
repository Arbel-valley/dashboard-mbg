"use client";

import Link from "next/link";
import { useState } from "react";
import { useSWRConfig } from "swr";
import { HasilTransaksi, type HasilKirim, ringkasHasil } from "@/components/hasil-transaksi";
import { Kartu } from "@/components/kartu";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/page-header";
import { PilihProvinsi } from "@/components/pilih-provinsi";
import { PilihSimulasi } from "@/components/pilih-simulasi";
import { Button, buttonVariants } from "@/components/ui/button";
import { Centang, Field, Input, Select } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { denganSimulasi, kirim } from "@/lib/api";
import {
  DAYA_LISTRIK,
  JENIS_LANTAI,
  label,
  LABEL_KATEGORI,
  PEKERJAAN,
  PENDIDIKAN,
  SUMBER_AIR,
  URUTAN_KATEGORI,
} from "@/lib/format";
import { useWilayah } from "@/lib/hooks";
import { NODE } from "@/lib/node";
import type { Hasil2PC, KategoriMBG, PendudukIn } from "@/lib/types";
import { cn } from "@/lib/utils";

type Form = {
  nim: string;
  nama: string;
  jenis_kelamin: "" | "L" | "P";
  tanggal_lahir: string;
  alamat: string;
  kode_provinsi: string;
  kategori_mbg: KategoriMBG[];
  perkotaan: "" | "kota" | "desa";
  penghasilan_bulanan: string;
  jumlah_art: string;
  pekerjaan_kk: string;
  pendidikan_kk: string;
  luas_lantai_m2: string;
  jenis_lantai: string;
  sumber_air: string;
  daya_listrik_va: string;
  punya_motor: boolean;
  punya_mobil: boolean;
  punya_lahan: boolean;
};

const KOSONG: Form = {
  nim: "",
  nama: "",
  jenis_kelamin: "",
  tanggal_lahir: "",
  alamat: "",
  kode_provinsi: "",
  kategori_mbg: [],
  perkotaan: "",
  penghasilan_bulanan: "",
  jumlah_art: "",
  pekerjaan_kk: "",
  pendidikan_kk: "",
  luas_lantai_m2: "",
  jenis_lantai: "",
  sumber_air: "",
  daya_listrik_va: "",
  punya_motor: false,
  punya_mobil: false,
  punya_lahan: false,
};

/** NIM demo berawalan 8 (data seed berawalan 9), supaya mudah dibedakan. */
const nimAcak = () => "8" + Array.from({ length: 10 }, () => Math.floor(Math.random() * 10)).join("");

const CONTOH = (): Form => ({
  ...KOSONG,
  nim: nimAcak(),
  nama: "Siti Rahmawati",
  jenis_kelamin: "P",
  tanggal_lahir: "1998-04-12",
  alamat: "Jl. Kenanga No. 5",
  kode_provinsi: "32",
  kategori_mbg: ["ibu_menyusui"],
  perkotaan: "kota",
  penghasilan_bulanan: "2800000",
  jumlah_art: "4",
  pekerjaan_kk: "buruh_bangunan",
  pendidikan_kk: "smp",
  luas_lantai_m2: "30",
  jenis_lantai: "semen",
  sumber_air: "sumur_terlindung",
  daya_listrik_va: "900",
  punya_motor: true,
});

export default function HalamanRegistrasi() {
  const { peta } = useWilayah();
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const [f, setF] = useState<Form>(KOSONG);
  const [simulasi, setSimulasi] = useState("");
  const [proses, setProses] = useState(false);
  const [hasil, setHasil] = useState<HasilKirim>(null);

  const ubah = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const node = f.kode_provinsi ? peta.get(Number(f.kode_provinsi))?.node : undefined;

  async function daftarkan(e: React.FormEvent) {
    e.preventDefault();
    setProses(true);
    setHasil(null);
    const body: PendudukIn = {
      nim: f.nim,
      nama: f.nama.trim(),
      jenis_kelamin: f.jenis_kelamin as "L" | "P",
      tanggal_lahir: f.tanggal_lahir,
      alamat: f.alamat.trim() || null,
      kode_provinsi: Number(f.kode_provinsi),
      kategori_mbg: f.kategori_mbg,
      sosek: {
        perkotaan: f.perkotaan === "kota",
        penghasilan_bulanan: Number(f.penghasilan_bulanan),
        jumlah_art: Number(f.jumlah_art),
        pekerjaan_kk: f.pekerjaan_kk,
        pendidikan_kk: f.pendidikan_kk,
        luas_lantai_m2: Number(f.luas_lantai_m2),
        jenis_lantai: f.jenis_lantai as PendudukIn["sosek"]["jenis_lantai"],
        sumber_air: f.sumber_air as PendudukIn["sosek"]["sumber_air"],
        daya_listrik_va: Number(f.daya_listrik_va),
        punya_motor: f.punya_motor,
        punya_mobil: f.punya_mobil,
        punya_lahan: f.punya_lahan,
      },
    };
    let h: Exclude<HasilKirim, null>;
    try {
      const data = await kirim<Hasil2PC>(denganSimulasi("/penduduk", simulasi), body);
      h = { ok: true, data };
      mutate((k) => typeof k === "string" && (k.startsWith("/penduduk") || k.startsWith("/dashboard")));
    } catch (error) {
      h = { ok: false, error };
    }
    setHasil(h);
    toast(ringkasHasil(h, "Penduduk terdaftar"));
    setProses(false);
  }

  const berhasil = hasil?.ok && hasil.data.status === "COMMIT";

  return (
    <>
      <PageHeader
        judul="Registrasi penduduk"
        sub="Disimpan serentak di pusat dan node wilayah"
        aksi={
          <Button variant="secondary" type="button" onClick={() => setF(CONTOH())}>
            Isi data contoh
          </Button>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <form onSubmit={daftarkan} className="space-y-6">
          <Kartu judul="Identitas">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="NIM" htmlFor="nim" bantuan="8 sampai 20 digit. Menggantikan NIK pada proyek ini.">
                <div className="flex gap-2">
                  <Input
                    id="nim"
                    required
                    inputMode="numeric"
                    pattern="[0-9]{8,20}"
                    value={f.nim}
                    onChange={(e) => ubah("nim", e.target.value.replace(/\D/g, ""))}
                  />
                  <Button type="button" variant="secondary" onClick={() => ubah("nim", nimAcak())}>
                    Acak
                  </Button>
                </div>
              </Field>
              <Field label="Nama lengkap" htmlFor="nama">
                <Input id="nama" required value={f.nama} onChange={(e) => ubah("nama", e.target.value)} />
              </Field>
              <Field label="Jenis kelamin" htmlFor="jk">
                <Select
                  id="jk"
                  required
                  value={f.jenis_kelamin}
                  onChange={(e) => ubah("jenis_kelamin", e.target.value as Form["jenis_kelamin"])}
                >
                  <option value="" disabled>
                    Pilih
                  </option>
                  <option value="L">Laki-laki</option>
                  <option value="P">Perempuan</option>
                </Select>
              </Field>
              <Field label="Tanggal lahir" htmlFor="lahir">
                <Input
                  id="lahir"
                  type="date"
                  required
                  value={f.tanggal_lahir}
                  onChange={(e) => ubah("tanggal_lahir", e.target.value)}
                />
              </Field>
              <Field label="Provinsi" htmlFor="prov" className="sm:col-span-2">
                <PilihProvinsi id="prov" value={f.kode_provinsi} onChange={(v) => ubah("kode_provinsi", v)} required />
              </Field>
              <Field label="Alamat" htmlFor="alamat" className="sm:col-span-2">
                <Input id="alamat" value={f.alamat} onChange={(e) => ubah("alamat", e.target.value)} />
              </Field>
              <fieldset className="sm:col-span-2">
                <legend className="mb-2 text-[13px] font-medium text-ink">Kategori sasaran MBG</legend>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {URUTAN_KATEGORI.map((k) => (
                    <Centang
                      key={k}
                      label={LABEL_KATEGORI[k]}
                      checked={f.kategori_mbg.includes(k)}
                      onChange={(e) =>
                        ubah(
                          "kategori_mbg",
                          e.target.checked ? [...f.kategori_mbg, k] : f.kategori_mbg.filter((x) => x !== k),
                        )
                      }
                    />
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-ink-soft">Kosongkan kalau tidak termasuk sasaran.</p>
              </fieldset>
            </div>
          </Kartu>

          <Kartu judul="Sosial-ekonomi" sub="Dasar perhitungan skor dan desil">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Penghasilan rumah tangga per bulan (Rp)" htmlFor="gaji">
                <Input
                  id="gaji"
                  type="number"
                  min={0}
                  step={1000}
                  required
                  value={f.penghasilan_bulanan}
                  onChange={(e) => ubah("penghasilan_bulanan", e.target.value)}
                />
              </Field>
              <Field label="Jumlah anggota rumah tangga" htmlFor="art">
                <Input
                  id="art"
                  type="number"
                  min={1}
                  max={20}
                  required
                  value={f.jumlah_art}
                  onChange={(e) => ubah("jumlah_art", e.target.value)}
                />
              </Field>
              <Field label="Wilayah tempat tinggal" htmlFor="kota">
                <Select
                  id="kota"
                  required
                  value={f.perkotaan}
                  onChange={(e) => ubah("perkotaan", e.target.value as Form["perkotaan"])}
                >
                  <option value="" disabled>
                    Pilih
                  </option>
                  <option value="kota">Perkotaan</option>
                  <option value="desa">Perdesaan</option>
                </Select>
              </Field>
              <PilihanKode id="kerja" label="Pekerjaan kepala keluarga" opsi={PEKERJAAN} value={f.pekerjaan_kk} onChange={(v) => ubah("pekerjaan_kk", v)} />
              <PilihanKode id="didik" label="Pendidikan kepala keluarga" opsi={PENDIDIKAN} value={f.pendidikan_kk} onChange={(v) => ubah("pendidikan_kk", v)} />
              <Field label="Luas lantai rumah (m²)" htmlFor="luas">
                <Input
                  id="luas"
                  type="number"
                  min={1}
                  step={0.1}
                  required
                  value={f.luas_lantai_m2}
                  onChange={(e) => ubah("luas_lantai_m2", e.target.value)}
                />
              </Field>
              <PilihanKode id="lantai" label="Jenis lantai" opsi={JENIS_LANTAI} value={f.jenis_lantai} onChange={(v) => ubah("jenis_lantai", v)} />
              <PilihanKode id="air" label="Sumber air minum" opsi={SUMBER_AIR} value={f.sumber_air} onChange={(v) => ubah("sumber_air", v)} />
              <Field label="Daya listrik" htmlFor="listrik">
                <Select
                  id="listrik"
                  required
                  value={f.daya_listrik_va}
                  onChange={(e) => ubah("daya_listrik_va", e.target.value)}
                >
                  <option value="" disabled>
                    Pilih
                  </option>
                  {DAYA_LISTRIK.map((d) => (
                    <option key={d} value={d}>
                      {d.toLocaleString("id-ID")} VA
                    </option>
                  ))}
                </Select>
              </Field>
              <fieldset className="sm:col-span-2">
                <legend className="mb-2 text-[13px] font-medium text-ink">Aset rumah tangga</legend>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  <Centang label="Motor" checked={f.punya_motor} onChange={(e) => ubah("punya_motor", e.target.checked)} />
                  <Centang label="Mobil" checked={f.punya_mobil} onChange={(e) => ubah("punya_mobil", e.target.checked)} />
                  <Centang label="Lahan" checked={f.punya_lahan} onChange={(e) => ubah("punya_lahan", e.target.checked)} />
                </div>
              </fieldset>
            </div>
          </Kartu>

          <Panel>
            <div className="grid items-end gap-4 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_auto]">
              <PilihSimulasi id="simulasi" value={simulasi} onChange={setSimulasi} />
              <Button type="submit" disabled={proses} className="sm:mb-[22px]">
                {proses ? "Mendaftarkan..." : "Daftarkan"}
              </Button>
            </div>
          </Panel>
        </form>

        <aside className="space-y-4 lg:sticky lg:top-6">
          {hasil ? (
            <HasilTransaksi hasil={hasil}>
              {berhasil && hasil.ok ? (
                <Link href={`/penduduk/${hasil.data.nim}`} className={cn(buttonVariants({ variant: "secondary" }), "w-full")}>
                  Lihat data {hasil.data.nim}
                </Link>
              ) : null}
            </HasilTransaksi>
          ) : (
            <Kartu judul="Alur 2PC" sub="Semua atau tidak sama sekali">
              <ol className="space-y-2.5 text-sm">
                {[
                  ["Pusat", "catat NIM di direktori global", "bg-ink"],
                  [node ? `Node ${node}` : "Node wilayah", "simpan identitas & sosek", node ? NODE[node].bg : "bg-line"],
                  ["Koordinator", "prepare, catat keputusan, commit", "bg-aksen"],
                ].map(([siapa, apa, titik], i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", titik)} />
                    <span>
                      <strong className="font-semibold text-ink">{siapa}</strong> <span className="text-ink-soft">{apa}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </Kartu>
          )}
          {hasil ? (
            <Button variant="ghost" className="w-full" onClick={() => { setHasil(null); setF(KOSONG); }}>
              Daftarkan penduduk lain
            </Button>
          ) : null}
        </aside>
      </div>
    </>
  );
}

function PilihanKode({
  id,
  label: judul,
  opsi,
  value,
  onChange,
}: {
  id: string;
  label: string;
  opsi: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={judul} htmlFor={id}>
      <Select id={id} required value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>
          Pilih
        </option>
        {opsi.map((o) => (
          <option key={o} value={o}>
            {label(o)}
          </option>
        ))}
      </Select>
    </Field>
  );
}

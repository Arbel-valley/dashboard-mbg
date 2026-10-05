// Tipe respons FastAPI (backend/app/main.py). Ditulis mengikuti JSON asli tiap endpoint.

export type NodeWilayah = "barat" | "tengah" | "timur";
export type NamaNode = "pusat" | "replica" | NodeWilayah;
export type KategoriMBG = "peserta_didik" | "balita" | "ibu_hamil" | "ibu_menyusui" | "pendidik";
export type Simulasi = "gagal_prepare" | "crash_sebelum_keputusan" | "crash_setelah_keputusan";

// ---------------------------------------------------------------- /status
interface StatusDasar {
  hidup: boolean;
  error?: string;
  standby?: boolean;
  prepared_xacts?: string[];
}
export interface StatusPusat extends StatusDasar {
  direktori_per_node?: Partial<Record<NodeWilayah, number>>;
  replikasi?: { application_name: string; jenis: string; state: string; replay_lag: string | null }[];
  slot_logical?: { slot_name: string; active: boolean }[];
}
export interface StatusReplica extends StatusDasar {
  direktori_per_node?: Partial<Record<NodeWilayah, number>>;
  sinkron?: { semua_wal_diterapkan: boolean | null; transaksi_terakhir_diterapkan: string | null };
}
export interface StatusWilayah extends StatusDasar {
  fragmen?: { nama: string; prov_min: number; prov_max: number };
  jumlah?: { identitas: number; sosek: number; klasifikasi: number };
  referensi?: { wilayah: number; program: number; garis_kemiskinan: number };
  subscription?: { subname: string; worker_aktif: boolean; terakhir_sinkron: string | null }[];
}
export interface StatusCluster {
  pusat: StatusPusat;
  replica: StatusReplica;
  barat: StatusWilayah;
  tengah: StatusWilayah;
  timur: StatusWilayah;
  cek_direktori_vs_fragmen?: Partial<Record<NodeWilayah, string>>;
}

// ---------------------------------------------------------------- referensi
export interface Wilayah {
  kode_provinsi: number;
  nama_provinsi: string;
  node: NodeWilayah;
}
export interface ReferensiWilayah {
  dibaca_dari: string;
  baris: Wilayah[];
}

// ---------------------------------------------------------------- dashboard
export interface BarisRingkasan {
  node: NodeWilayah;
  kode_provinsi: number;
  nama_provinsi: string;
  jumlah_penduduk: number;
  penghasilan_per_kapita: number | null;
  di_bawah_garis_kemiskinan: number;
  mbg_peserta_didik: number;
  mbg_balita: number;
  mbg_ibu_hamil: number;
  mbg_ibu_menyusui: number;
  mbg_pendidik: number;
}
export interface Ringkasan {
  mode: "global" | "parsial";
  dilayani_oleh?: string;
  node_tidak_tersedia?: NodeWilayah[];
  catatan?: string;
  garis_kemiskinan: { gk_kota: number; gk_desa: number } | null;
  baris: BarisRingkasan[];
}
export interface Program {
  kode: string;
  nama: string;
  basis: "desil" | "kategori";
  desil_maks: number | null;
  dasar_hukum: string | null;
  jumlah_layak: number | null;
  catatan?: string;
}
export interface RingkasanDesil {
  dilayani_oleh: string;
  distribusi: { desil: number; jumlah: number }[];
  kelayakan_program: Program[];
  catatan?: string;
}
export interface Explain {
  cara_baca: string;
  rencana: string[];
}

// ---------------------------------------------------------------- penduduk
export interface BarisPenduduk {
  fragmen: string;
  nim: string;
  nama: string;
  kode_provinsi: number;
  kategori_mbg: KategoriMBG[];
}
export interface DaftarPenduduk {
  dilayani_oleh: string;
  total: number;
  offset: number;
  jumlah: number;
  baris: BarisPenduduk[];
}
export interface DataPenduduk {
  nim: string;
  nama: string;
  jenis_kelamin: "L" | "P";
  tanggal_lahir: string;
  alamat: string | null;
  kode_provinsi: number;
  kategori_mbg: KategoriMBG[];
  perkotaan: boolean;
  penghasilan_bulanan: number;
  jumlah_art: number;
  penghasilan_per_kapita: number;
  pekerjaan_kk: string;
  pendidikan_kk: string;
  luas_lantai_m2: number;
  jenis_lantai: string;
  sumber_air: string;
  daya_listrik_va: number;
  punya_motor: boolean;
  punya_mobil: boolean;
  punya_lahan: boolean;
  skor: number | null;
  desil: number | null;
  metode: string | null;
}
export interface DetailPenduduk {
  lokasi: { node: NodeWilayah; direktori_dibaca_dari: string };
  data: DataPenduduk;
}
export interface SosekIn {
  perkotaan: boolean;
  penghasilan_bulanan: number;
  jumlah_art: number;
  pekerjaan_kk: string;
  pendidikan_kk: string;
  luas_lantai_m2: number;
  jenis_lantai: "tanah" | "semen" | "keramik";
  sumber_air: "sungai" | "sumur_tak_terlindung" | "sumur_terlindung" | "pdam" | "air_kemasan";
  daya_listrik_va: number;
  punya_motor: boolean;
  punya_mobil: boolean;
  punya_lahan: boolean;
}
export interface PendudukIn {
  nim: string;
  nama: string;
  jenis_kelamin: "L" | "P";
  tanggal_lahir: string;
  alamat: string | null;
  kode_provinsi: number;
  kategori_mbg: KategoriMBG[];
  sosek: SosekIn;
}

// ---------------------------------------------------------------- 2PC
export type Status2PC = "COMMIT" | "IN-DOUBT" | "COMMIT-SEBAGIAN" | "COMMIT-TERTUNDA" | "ABORT";

/** Respons sukses (2xx) semua operasi tulis. */
export interface Hasil2PC {
  gid: string;
  operasi: string;
  status: Exclude<Status2PC, "ABORT">;
  peserta: string[];
  tertunda: string[];
  jejak: string[];
  // tambahan per endpoint
  nim?: string;
  node?: NodeWilayah;
  provinsi?: string;
  dari?: NodeWilayah;
  ke?: NodeWilayah;
  provinsi_baru?: string;
  cutoff_desil?: number[];
  jumlah_skor?: number;
  skor_per_node?: Partial<Record<NodeWilayah, number>>;
}

/** Body error saat transaksi dibatalkan (409/422/423/503). */
export interface Gagal2PC {
  status: "ABORT";
  gid: string;
  pesan: string;
  jenis: string;
  detail: string;
  jejak: string[];
}

export interface BarisLog2PC {
  gid: string;
  operasi: string;
  peserta: string[];
  status: "MULAI" | "PREPARED" | "COMMIT" | "SELESAI" | "ABORT";
  keterangan: string | null;
  dibuat: string;
  diubah: string;
}
export interface Log2PC {
  dibaca_dari: string;
  baris: BarisLog2PC[];
}
export interface HasilPulihkan {
  ok: boolean;
  aturan?: string;
  tindakan: { node: string; gid: string; status_log?: string | null; aksi: string }[];
  log_diperbarui: string[];
  node_tak_terjangkau: string[];
  catatan?: string;
}

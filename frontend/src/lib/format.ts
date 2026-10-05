import type { KategoriMBG, NodeWilayah } from "./types";

const fAngka = new Intl.NumberFormat("id-ID");
const fPersen = new Intl.NumberFormat("id-ID", { style: "percent", maximumFractionDigits: 1 });

export const angka = (n: number | null | undefined) => (n == null ? "-" : fAngka.format(n));
export const rupiah = (n: number | null | undefined) => (n == null ? "-" : `Rp${fAngka.format(Math.round(n))}`);
export const persen = (bagian: number, total: number) => (total > 0 ? fPersen.format(bagian / total) : "-");

export function waktu(iso: string | null | undefined) {
  if (!iso) return "-";
  const d = new Date(iso.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "medium" });
}

export function tanggal(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("id-ID", { dateStyle: "long" });
}

export function umur(iso: string) {
  const lahir = new Date(iso);
  const kini = new Date();
  let th = kini.getFullYear() - lahir.getFullYear();
  const belum = kini.getMonth() < lahir.getMonth() || (kini.getMonth() === lahir.getMonth() && kini.getDate() < lahir.getDate());
  if (belum) th -= 1;
  if (th < 1) {
    const bln = (kini.getFullYear() - lahir.getFullYear()) * 12 + kini.getMonth() - lahir.getMonth();
    return `${Math.max(bln, 0)} bulan`;
  }
  return `${th} tahun`;
}

export const LABEL_KATEGORI: Record<KategoriMBG, string> = {
  peserta_didik: "Peserta didik",
  balita: "Balita",
  ibu_hamil: "Ibu hamil",
  ibu_menyusui: "Ibu menyusui",
  pendidik: "Pendidik & tendik",
};
export const URUTAN_KATEGORI: KategoriMBG[] = ["peserta_didik", "balita", "ibu_hamil", "ibu_menyusui", "pendidik"];

/** Label yang tidak bisa dibentuk otomatis dari kodenya. */
const LABEL_KHUSUS: Record<string, string> = {
  sd: "SD",
  smp: "SMP",
  sma: "SMA",
  pdam: "PDAM",
  pns_tni_polri: "PNS/TNI/Polri",
  sumur_tak_terlindung: "Sumur tidak terlindung",
};

export const PEKERJAAN = [
  "tidak_bekerja", "buruh_tani", "petani", "nelayan", "buruh_bangunan",
  "pedagang", "wiraswasta", "karyawan_swasta", "pns_tni_polri",
];
export const PENDIDIKAN = ["tidak_sekolah", "sd", "smp", "sma", "diploma", "sarjana"];
export const SUMBER_AIR = ["sungai", "sumur_tak_terlindung", "sumur_terlindung", "pdam", "air_kemasan"] as const;
export const JENIS_LANTAI = ["tanah", "semen", "keramik"] as const;
export const DAYA_LISTRIK = [450, 900, 1300, 2200, 3500];

/** "buruh_bangunan" -> "Buruh bangunan", "sma" -> "SMA" */
export function label(kode: string | null | undefined) {
  if (!kode) return "-";
  if (LABEL_KHUSUS[kode]) return LABEL_KHUSUS[kode];
  const s = kode.replaceAll("_", " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "identitas_timur" -> "timur" */
export function nodeDariFragmen(fragmen: string): NodeWilayah | null {
  const m = fragmen.match(/_(barat|tengah|timur)$/);
  return m ? (m[1] as NodeWilayah) : null;
}

/** "5 menit lalu", "2 jam lalu", atau tanggal kalau sudah lama. */
export function relatif(iso: string | null | undefined) {
  if (!iso) return "-";
  const d = new Date(iso);
  const detik = Math.round((Date.now() - d.getTime()) / 1000);
  if (Number.isNaN(detik)) return iso;
  if (detik < 60) return "baru saja";
  if (detik < 3600) return `${Math.floor(detik / 60)} menit lalu`;
  if (detik < 86400) return `${Math.floor(detik / 3600)} jam lalu`;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

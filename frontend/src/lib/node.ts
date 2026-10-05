import type { NodeWilayah } from "./types";

export const NODE_WILAYAH: NodeWilayah[] = ["barat", "tengah", "timur"];

// Class Tailwind ditulis utuh (bukan dirangkai) supaya ikut ter-generate.
export const NODE: Record<
  NodeWilayah,
  { nama: string; wilayah: string; rentang: string; bg: string; bgSoft: string; teks: string; border: string; fill: string }
> = {
  barat: {
    nama: "Barat",
    wilayah: "Sumatera & Kepulauan Riau",
    rentang: "11–29",
    bg: "bg-barat",
    bgSoft: "bg-barat-soft",
    teks: "text-barat-teks",
    border: "border-barat",
    fill: "#10b981",
  },
  tengah: {
    nama: "Tengah",
    wilayah: "Jawa & Bali",
    rentang: "30–51",
    bg: "bg-tengah",
    bgSoft: "bg-tengah-soft",
    teks: "text-tengah-teks",
    border: "border-tengah",
    fill: "#f97316",
  },
  timur: {
    nama: "Timur",
    wilayah: "Nusa Tenggara s.d. Papua",
    rentang: "52–99",
    bg: "bg-timur",
    bgSoft: "bg-timur-soft",
    teks: "text-timur-teks",
    border: "border-timur",
    fill: "#0ea5e9",
  },
};

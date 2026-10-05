"use client";

import useSWR from "swr";
import type { ReferensiWilayah, Wilayah } from "./types";

/** Daftar 38 provinsi + node penyimpannya (skema alokasi di database). Jarang berubah. */
export function useWilayah() {
  const swr = useSWR<ReferensiWilayah>("/referensi/wilayah", { revalidateOnFocus: false });
  const peta = new Map<number, Wilayah>((swr.data?.baris ?? []).map((w) => [w.kode_provinsi, w]));
  return { ...swr, peta };
}

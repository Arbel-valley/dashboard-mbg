"use client";

import { useSyncExternalStore } from "react";
import type { NodeWilayah } from "./types";

/** Filter node global (dipakai Ringkasan & Penduduk). Disimpan di localStorage, diingat antar kunjungan. */
export type FilterNode = NodeWilayah | "semua";

const EVENT = "filter-node-berubah";
const KUNCI = "filterNode";

function baca(): FilterNode {
  const v = localStorage.getItem(KUNCI);
  return v === "barat" || v === "tengah" || v === "timur" ? v : "semua";
}

function langganan(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb); // ikut berubah kalau diganti di tab lain
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useFilterNode(): FilterNode {
  return useSyncExternalStore(langganan, baca, () => "semua");
}

export function aturFilterNode(v: FilterNode) {
  localStorage.setItem(KUNCI, v);
  window.dispatchEvent(new Event(EVENT));
}

/** Tambahkan ?node=... ke path API kalau filter aktif. */
export function denganNode(path: string, filter: FilterNode) {
  return filter === "semua" ? path : `${path}${path.includes("?") ? "&" : "?"}node=${filter}`;
}

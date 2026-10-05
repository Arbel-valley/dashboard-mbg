"use client";

import { useSyncExternalStore } from "react";

/*
 * Preferensi tampilan (tema & sidebar) disimpan di DOM + localStorage, bukan di state React.
 * Alasannya: skrip di <head> sudah memasangnya SEBELUM React jalan (anti kedip),
 * jadi DOM adalah sumber kebenarannya. React cukup "berlangganan" lewat useSyncExternalStore.
 */
const EVENT = "tampilan-berubah";
export type Tema = "terang" | "gelap";

/** Skrip untuk <head>: pasang tema & status sidebar sebelum halaman digambar. */
export const SKRIP_AWAL = `(function(){try{var d=document.documentElement,t=localStorage.getItem("tema");if(!t){t=matchMedia("(prefers-color-scheme: dark)").matches?"gelap":"terang"}if(t==="gelap")d.classList.add("dark");if(localStorage.getItem("sidebar")==="ringkas")d.dataset.sidebar="ringkas"}catch(e){}})()`;

function langganan(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

export function useTema(): Tema {
  return useSyncExternalStore(
    langganan,
    () => (document.documentElement.classList.contains("dark") ? "gelap" : "terang"),
    () => "terang",
  );
}

export function aturTema(t: Tema) {
  document.documentElement.classList.toggle("dark", t === "gelap");
  localStorage.setItem("tema", t);
  window.dispatchEvent(new Event(EVENT));
}

export function useSidebarRingkas(): boolean {
  return useSyncExternalStore(
    langganan,
    () => document.documentElement.dataset.sidebar === "ringkas",
    () => false,
  );
}

export function aturSidebar(ringkas: boolean) {
  const el = document.documentElement;
  if (ringkas) el.dataset.sidebar = "ringkas";
  else delete el.dataset.sidebar;
  localStorage.setItem("sidebar", ringkas ? "ringkas" : "lebar");
  window.dispatchEvent(new Event(EVENT));
}

/** Warna grafik Recharts (atribut SVG butuh nilai warna langsung, jadi dipilih per tema). */
export function warnaGrafik(tema: Tema) {
  const gelap = tema === "gelap";
  return {
    grid: gelap ? "#1e293b" : "#f1f5f9",
    tick: gelap ? "#64748b" : "#94a3b8",
    kursor: gelap ? "#1e293b" : "#f1f5f9",
    trek: gelap ? "#1e293b" : "#f1f5f9",
    lemah: gelap ? "#312e81" : "#e0e7ff",
    tooltip: {
      borderRadius: 8,
      border: `1px solid ${gelap ? "#334155" : "#e2e8f0"}`,
      background: gelap ? "#0f172a" : "#ffffff",
      color: gelap ? "#f1f5f9" : "#0f172a",
      fontSize: 12,
      boxShadow: "none",
    },
  };
}

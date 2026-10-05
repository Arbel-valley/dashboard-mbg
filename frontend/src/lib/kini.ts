"use client";

import { useSyncExternalStore } from "react";

/*
 * Jam bersama yang berdetak tiap detik, untuk teks "3 dtk lalu".
 * Date.now() hanya dipanggil di dalam timer (bukan saat render), jadi render tetap murni.
 */
let kini = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const pendengar = new Set<() => void>();

function langganan(cb: () => void) {
  pendengar.add(cb);
  if (!timer) {
    kini = Date.now();
    timer = setInterval(() => {
      kini = Date.now();
      pendengar.forEach((f) => f());
    }, 1000);
  }
  return () => {
    pendengar.delete(cb);
    if (pendengar.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function useKini(): number {
  return useSyncExternalStore(langganan, () => kini, () => 0);
}

"use client";

import {
  Activity,
  ChevronRight,
  ClipboardList,
  Database,
  LayoutDashboard,
  Moon,
  PanelLeft,
  Search,
  Soup,
  Sun,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { CommandPalette } from "@/components/command-palette";
import { StatusRingkas } from "@/components/status-ringkas";
import { aturFilterNode, type FilterNode, useFilterNode } from "@/lib/filter-node";
import { NODE_WILAYAH } from "@/lib/node";
import { aturSidebar, aturTema, useSidebarRingkas, useTema } from "@/lib/tampilan";
import type { StatusCluster } from "@/lib/types";
import { cn } from "@/lib/utils";

const GRUP = [
  {
    judul: "Data penerima",
    menu: [
      { href: "/", label: "Ringkasan", ikon: LayoutDashboard },
      { href: "/penduduk", label: "Penduduk", ikon: Users },
      { href: "/registrasi", label: "Registrasi", ikon: ClipboardList },
      { href: "/desil", label: "Desil & program", ikon: Activity },
    ],
  },
  {
    judul: "Sistem",
    menu: [{ href: "/cluster", label: "Status cluster", ikon: Database }],
  },
];

/** Halaman yang ikut filter node global. */
const PAKAI_FILTER = ["/", "/penduduk"];

function remahRoti(path: string): string[] {
  for (const g of GRUP) {
    for (const m of g.menu) {
      if (m.href === "/" ? path === "/" : path === m.href) return [g.judul, m.label];
      if (m.href !== "/" && path.startsWith(`${m.href}/`)) return [g.judul, m.label, decodeURIComponent(path.slice(m.href.length + 1))];
    }
  }
  return ["Dasbor MBG"];
}

const tombolIkon =
  "inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-line text-ink-soft transition-colors hover:bg-secondary hover:text-ink";

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const tema = useTema();
  const ringkas = useSidebarRingkas();
  const filter = useFilterNode();
  const [palet, setPalet] = useState(false);
  const [terakhir, setTerakhir] = useState<number | null>(null);
  const { data, error } = useSWR<StatusCluster>("/status", {
    refreshInterval: 5000,
    onSuccess: () => setTerakhir(Date.now()),
  });
  const remah = remahRoti(path);

  // Pintasan keyboard: Ctrl/Cmd+K = palet perintah, Ctrl/Cmd+B = perkecil sidebar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "k") {
        e.preventDefault();
        setPalet((b) => !b);
      } else if (k === "b") {
        e.preventDefault();
        aturSidebar(document.documentElement.dataset.sidebar !== "ringkas");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-dvh bg-sidebar transition-[grid-template-columns] duration-200 md:grid md:grid-cols-[232px_1fr] md:ringkas:grid-cols-[60px_1fr]">
      <aside className="border-b border-line md:border-b-0">
        <div className="md:sticky md:top-0">
          <div className="flex items-center gap-2.5 px-4 pt-4 pb-3 md:pb-5 md:ringkas:justify-center md:ringkas:px-0">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-aksen text-white">
              <Soup className="size-4" aria-hidden />
            </span>
            <span className="text-sm font-semibold whitespace-nowrap text-ink md:ringkas:hidden">Dasbor MBG</span>
          </div>
          <nav aria-label="Menu utama" className="flex gap-4 overflow-x-auto px-2 pb-3 md:block md:space-y-5 md:overflow-visible">
            {GRUP.map((g) => (
              <div key={g.judul} className="flex shrink-0 gap-0.5 md:block md:space-y-0.5">
                <p className="hidden px-2 pb-1.5 text-xs whitespace-nowrap text-ink-soft md:block md:ringkas:hidden">{g.judul}</p>
                {g.menu.map(({ href, label, ikon: Ikon }) => {
                  const aktif = href === "/" ? path === "/" : path.startsWith(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      title={ringkas ? label : undefined}
                      aria-label={label}
                      aria-current={aktif ? "page" : undefined}
                      className={cn(
                        "flex shrink-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors md:ringkas:justify-center md:ringkas:py-2",
                        aktif ? "bg-aksen-soft font-medium text-aksen-teks" : "text-ink/80 hover:bg-secondary",
                      )}
                    >
                      <Ikon className={cn("size-4 shrink-0", aktif ? "text-aksen-teks" : "text-ink-soft")} aria-hidden />
                      <span className="whitespace-nowrap md:ringkas:hidden">{label}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>
      </aside>

      <div className="min-w-0 bg-background md:my-2 md:mr-2 md:rounded-xl md:border md:border-line">
        <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
          <button
            type="button"
            onClick={() => aturSidebar(!ringkas)}
            className={cn(tombolIkon, "hidden border-transparent md:inline-flex")}
            aria-label={ringkas ? "Perlebar sidebar" : "Perkecil sidebar"}
            title={`${ringkas ? "Perlebar" : "Perkecil"} sidebar (Ctrl+B)`}
          >
            <PanelLeft className="size-4" aria-hidden />
          </button>
          <nav aria-label="Lokasi" className="flex min-w-0 items-center gap-1.5 text-[13px]">
            {remah.map((r, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 ? <ChevronRight className="size-3.5 text-ink-soft" aria-hidden /> : null}
                <span className={i === remah.length - 1 ? "font-medium text-ink" : "text-ink-soft"}>{r}</span>
              </span>
            ))}
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {PAKAI_FILTER.includes(path) ? (
              <select
                aria-label="Filter node"
                value={filter}
                onChange={(e) => aturFilterNode(e.target.value as FilterNode)}
                className={cn(
                  "h-9 rounded-lg border bg-card pr-7 pl-2.5 text-[13px]",
                  filter === "semua" ? "border-line text-ink" : "border-aksen/50 font-medium text-aksen-teks",
                )}
              >
                <option value="semua">Semua node</option>
                {NODE_WILAYAH.map((n) => (
                  <option key={n} value={n}>
                    Node {n}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              onClick={() => setPalet(true)}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-card pr-2 pl-2.5 text-[13px] text-ink-soft hover:bg-secondary"
            >
              <Search className="size-4" aria-hidden />
              <span className="hidden sm:inline">Cari atau jalankan...</span>
              <kbd className="rounded border border-line px-1.5 text-[11px]">Ctrl K</kbd>
            </button>
            {/* Saat request terakhir gagal, data lama (cache SWR) sengaja tidak dipakai: bisa basi. */}
            <StatusRingkas status={error ? undefined : data} gagal={!!error} diperbarui={terakhir} />
            <button
              type="button"
              onClick={() => aturTema(tema === "gelap" ? "terang" : "gelap")}
              className={tombolIkon}
              aria-label={tema === "gelap" ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
              title={tema === "gelap" ? "Mode terang" : "Mode gelap"}
            >
              {tema === "gelap" ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
            </button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1280px] px-5 py-6">{children}</main>
      </div>
      {palet ? <CommandPalette onTutup={() => setPalet(false)} /> : null}
    </div>
  );
}

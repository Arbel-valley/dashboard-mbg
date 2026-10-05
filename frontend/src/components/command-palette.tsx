"use client";

import {
  Activity,
  ClipboardList,
  Database,
  Filter,
  LayoutDashboard,
  type LucideIcon,
  Moon,
  PanelLeft,
  RotateCcw,
  Search,
  Sigma,
  Sun,
  UserPlus,
  UserRound,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { ringkasHasil } from "@/components/hasil-transaksi";
import { useToast } from "@/components/toast";
import { kirim } from "@/lib/api";
import { aturFilterNode, useFilterNode } from "@/lib/filter-node";
import { NODE, NODE_WILAYAH } from "@/lib/node";
import { aturSidebar, aturTema, useSidebarRingkas, useTema } from "@/lib/tampilan";
import type { Hasil2PC, HasilPulihkan } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Perintah {
  id: string;
  grup: string;
  label: string;
  ikon: LucideIcon;
  kata?: string; // kata kunci tambahan untuk pencarian
  pintasan?: string;
  jalankan: () => void;
}

/** Palet perintah (Ctrl+K): cari halaman, jalankan aksi, atau buka NIM. */
export function CommandPalette({ onTutup }: { onTutup: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const tema = useTema();
  const ringkas = useSidebarRingkas();
  const filter = useFilterNode();
  const [q, setQ] = useState("");
  const [pilih, setPilih] = useState({ q: "", i: 0 }); // indeks aktif, otomatis kembali ke 0 saat kata kunci berubah
  const daftarRef = useRef<HTMLUListElement>(null);

  const segarkan = () => mutate((k) => typeof k === "string" && (k.startsWith("/dashboard") || k.startsWith("/penduduk") || k.startsWith("/twopc") || k === "/status"));

  const pergi = (href: string) => () => router.push(href);
  const perintah: Perintah[] = [
    { id: "p-ringkasan", grup: "Halaman", label: "Ringkasan", ikon: LayoutDashboard, kata: "dashboard beranda", jalankan: pergi("/") },
    { id: "p-penduduk", grup: "Halaman", label: "Penduduk", ikon: Users, kata: "daftar warga", jalankan: pergi("/penduduk") },
    { id: "p-registrasi", grup: "Halaman", label: "Registrasi", ikon: ClipboardList, kata: "daftar baru", jalankan: pergi("/registrasi") },
    { id: "p-desil", grup: "Halaman", label: "Desil & program", ikon: Activity, kata: "bansos pkh bpnt pbi", jalankan: pergi("/desil") },
    { id: "p-cluster", grup: "Halaman", label: "Status cluster", ikon: Database, kata: "node replika log 2pc", jalankan: pergi("/cluster") },
    { id: "a-daftar", grup: "Aksi", label: "Daftarkan penduduk baru", ikon: UserPlus, kata: "registrasi tambah", jalankan: pergi("/registrasi") },
    {
      id: "a-desil",
      grup: "Aksi",
      label: "Hitung desil nasional",
      ikon: Sigma,
      kata: "2pc peringkat",
      jalankan: async () => {
        toast({ jenis: "info", judul: "Menghitung desil..." });
        try {
          const data = await kirim<Hasil2PC>("/desil/hitung");
          toast(ringkasHasil({ ok: true, data }, "Desil nasional diperbarui"));
          segarkan();
        } catch (error) {
          toast(ringkasHasil({ ok: false, error }, ""));
        }
      },
    },
    {
      id: "a-pulihkan",
      grup: "Aksi",
      label: "Pulihkan transaksi menggantung",
      ikon: RotateCcw,
      kata: "recovery in-doubt 2pc",
      jalankan: async () => {
        try {
          const d = await kirim<HasilPulihkan>("/twopc/pulihkan?umur_min_detik=0");
          toast(
            d.tindakan.length
              ? { jenis: "sukses", judul: "Pemulihan selesai", isi: `${d.tindakan.length} tindakan dijalankan.` }
              : { jenis: "info", judul: "Tidak ada yang menggantung" },
          );
          segarkan();
        } catch (error) {
          toast(ringkasHasil({ ok: false, error }, ""));
        }
      },
    },
    {
      id: "t-tema",
      grup: "Tampilan",
      label: tema === "gelap" ? "Mode terang" : "Mode gelap",
      ikon: tema === "gelap" ? Sun : Moon,
      kata: "tema dark light gelap terang",
      jalankan: () => aturTema(tema === "gelap" ? "terang" : "gelap"),
    },
    {
      id: "t-sidebar",
      grup: "Tampilan",
      label: ringkas ? "Perlebar sidebar" : "Perkecil sidebar",
      ikon: PanelLeft,
      kata: "menu minimize",
      pintasan: "Ctrl B",
      jalankan: () => aturSidebar(!ringkas),
    },
    ...(["semua", ...NODE_WILAYAH] as const)
      .filter((n) => n !== filter)
      .map((n) => ({
        id: `f-${n}`,
        grup: "Filter node",
        label: n === "semua" ? "Tampilkan semua node" : `Tampilkan node ${n} saja`,
        ikon: Filter,
        kata: n === "semua" ? "reset" : NODE[n].wilayah,
        jalankan: () => aturFilterNode(n),
      })),
  ];

  const kunci = q.trim().toLowerCase();
  const nim = /^\d{8,20}$/.test(q.trim()) ? q.trim() : null;
  const tampil: Perintah[] = [
    ...(nim ? [{ id: "nim", grup: "Penduduk", label: `Buka NIM ${nim}`, ikon: UserRound, jalankan: pergi(`/penduduk/${nim}`) }] : []),
    ...perintah.filter((p) => !kunci || `${p.label} ${p.kata ?? ""} ${p.grup}`.toLowerCase().includes(kunci)),
  ];
  const aktif = pilih.q === q ? Math.min(pilih.i, Math.max(tampil.length - 1, 0)) : 0;

  useEffect(() => {
    daftarRef.current?.querySelector<HTMLElement>(`[data-indeks="${aktif}"]`)?.scrollIntoView({ block: "nearest" });
  }, [aktif]);

  const jalankan = (p?: Perintah) => {
    if (!p) return;
    onTutup();
    p.jalankan();
  };

  let grupSebelum = "";
  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/30 px-4 pt-[12vh] backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onTutup();
      }}
    >
      <div role="dialog" aria-modal="true" aria-label="Palet perintah" className="animasi-masuk w-full max-w-[560px] overflow-hidden rounded-xl border border-line bg-card shadow-2xl">
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search className="size-4 shrink-0 text-ink-soft" aria-hidden />
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="daftar-perintah"
            aria-activedescendant={tampil[aktif] ? `perintah-${tampil[aktif].id}` : undefined}
            placeholder="Cari halaman, aksi, atau ketik NIM..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const n = tampil.length || 1;
                setPilih({ q, i: (aktif + (e.key === "ArrowDown" ? 1 : -1) + n) % n });
              } else if (e.key === "Enter") {
                e.preventDefault();
                jalankan(tampil[aktif]);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onTutup();
              }
            }}
            className="h-12 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-soft"
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 text-[11px] text-ink-soft">Esc</kbd>
        </div>
        <ul id="daftar-perintah" role="listbox" ref={daftarRef} className="max-h-[360px] overflow-y-auto p-2">
          {tampil.length === 0 ? <li className="px-3 py-8 text-center text-sm text-ink-soft">Tidak ada hasil.</li> : null}
          {tampil.map((p, i) => {
            const judulGrup = p.grup !== grupSebelum ? p.grup : null;
            grupSebelum = p.grup;
            const Ikon = p.ikon;
            return (
              <li key={p.id} role="presentation">
                {judulGrup ? <p className="px-2 pt-2 pb-1 text-xs text-ink-soft">{judulGrup}</p> : null}
                <div
                  id={`perintah-${p.id}`}
                  role="option"
                  aria-selected={i === aktif}
                  data-indeks={i}
                  onMouseMove={() => i !== aktif && setPilih({ q, i })}
                  onClick={() => jalankan(p)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm",
                    i === aktif ? "bg-aksen-soft text-aksen-teks" : "text-ink",
                  )}
                >
                  <Ikon className={cn("size-4 shrink-0", i === aktif ? "text-aksen-teks" : "text-ink-soft")} aria-hidden />
                  <span className="flex-1">{p.label}</span>
                  {p.pintasan ? <kbd className="text-[11px] text-ink-soft">{p.pintasan}</kbd> : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

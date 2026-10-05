"use client";

import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { ErrorState } from "@/components/error-state";
import { NodeBadge } from "@/components/node-badge";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/components/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Centang } from "@/components/ui/field";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { kirim } from "@/lib/api";
import { angka, waktu } from "@/lib/format";
import { NODE, NODE_WILAYAH } from "@/lib/node";
import type { Explain, HasilPulihkan, Log2PC, NodeWilayah, StatusCluster } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function HalamanCluster() {
  const { data, error, mutate } = useSWR<StatusCluster>("/status", { refreshInterval: 5000 });

  if (error && !data) {
    return (
      <>
        <PageHeader judul="Status cluster" />
        <ErrorState error={error} onRetry={() => mutate()} />
      </>
    );
  }

  return (
    <>
      <PageHeader judul="Status cluster" sub="Lima database, diperbarui tiap 5 detik" />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {!data ? (
          Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-44" />)
        ) : (
          <>
            <KartuNode
              nama="Pusat"
              peran="Koordinator 2PC dan direktori NIM"
              hidup={data.pusat.hidup}
              error={data.pusat.error}
              menggantung={data.pusat.prepared_xacts?.length ?? 0}
              fakta={[
                ["Direktori", `${angka(sum(data.pusat.direktori_per_node))} NIM`],
                ["Replikasi aktif", `${data.pusat.replikasi?.filter((r) => r.state === "streaming").length ?? 0} koneksi`],
              ]}
            />
            <KartuNode
              nama="Replica"
              peran="Salinan pusat, hanya bisa dibaca"
              hidup={data.replica.hidup}
              error={data.replica.error}
              fakta={[
                ["Direktori", `${angka(sum(data.replica.direktori_per_node))} NIM`],
                [
                  "Sinkron",
                  data.replica.sinkron?.semua_wal_diterapkan == null
                    ? "-"
                    : data.replica.sinkron.semua_wal_diterapkan
                      ? "Ya, semua perubahan sudah diterapkan"
                      : "Belum, masih mengejar",
                ],
              ]}
            />
            {NODE_WILAYAH.map((n) => {
              const s = data[n];
              return (
                <KartuNode
                  key={n}
                  node={n}
                  nama={`Node ${NODE[n].nama.toLowerCase()}`}
                  peran={`${NODE[n].wilayah}, kode ${NODE[n].rentang}`}
                  hidup={s.hidup}
                  error={s.error}
                  menggantung={s.prepared_xacts?.length ?? 0}
                  fakta={[
                    ["Identitas", angka(s.jumlah?.identitas)],
                    ["Sosial-ekonomi", angka(s.jumlah?.sosek)],
                    ["Punya desil", angka(s.jumlah?.klasifikasi)],
                    [
                      "Referensi",
                      s.referensi ? `${s.referensi.wilayah} provinsi, ${s.referensi.program} program` : "-",
                    ],
                  ]}
                />
              );
            })}
          </>
        )}
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <Konsistensi data={data} />
        <Replikasi data={data} />
      </div>

      <Menggantung data={data} onSelesai={() => mutate()} />
      <LogKoordinator />
      <BuktiQuery />
    </>
  );
}

const sum = (o?: Partial<Record<NodeWilayah, number>>) => Object.values(o ?? {}).reduce((a, b) => a + (b ?? 0), 0);

function KartuNode({
  nama,
  peran,
  hidup,
  error,
  node,
  menggantung = 0,
  fakta,
}: {
  nama: string;
  peran: string;
  hidup: boolean;
  error?: string;
  node?: NodeWilayah;
  menggantung?: number;
  fakta: [string, string][];
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border bg-card px-4 py-3.5",
        !hidup ? "arsir-mati border-bahaya/40" : "border-line",
      )}
    >
      <p className={cn("flex items-center gap-2 font-semibold", !hidup ? "text-bahaya" : "text-ink")}>
        <span aria-hidden className={cn("size-2 rounded-full", !hidup ? "bg-bahaya" : node ? NODE[node].bg : "bg-ink")} />
        {nama}
      </p>
      <p className="text-xs text-ink-soft">{peran}</p>
      {hidup ? (
        <dl className="mt-3 space-y-1.5 text-[13px]">
          {fakta.map(([k, v]) => (
            <div key={k}>
              <dt className="text-ink-soft">{k}</dt>
              <dd className="text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-3 text-[13px] break-words text-bahaya">
          <strong className="block">Tidak terjangkau</strong>
          {error}
        </p>
      )}
      {menggantung > 0 ? (
        <Badge variant="gantung" className="mt-3 self-start">
          {menggantung} transaksi menggantung
        </Badge>
      ) : null}
    </div>
  );
}

function Konsistensi({ data }: { data?: StatusCluster }) {
  const cek = data?.cek_direktori_vs_fragmen;
  return (
    <Panel>
      <PanelHeader
        judul="Direktori vs fragmen"
        keterangan="Jumlah NIM per node"
      />
      <ul className="divide-y divide-line-soft px-5">
        {NODE_WILAYAH.map((n) => {
          const v = cek?.[n];
          return (
            <li key={n} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <NodeBadge node={n} />
              {!data ? (
                <Skeleton className="h-4 w-24" />
              ) : !v ? (
                <span className="text-ink-soft">Direktori tidak terbaca</span>
              ) : v === "OK" ? (
                <span className="text-ink">Cocok</span>
              ) : (
                <span className={cn("text-right", v.startsWith("BEDA") ? "font-medium text-gantung" : "text-bahaya")}>
                  {v.startsWith("BEDA") ? v.replace("BEDA: ", "Tidak cocok: ") : "Node tidak terjangkau"}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function Replikasi({ data }: { data?: StatusCluster }) {
  const r = data?.pusat.replikasi ?? [];
  return (
    <Panel>
      <PanelHeader
        judul="Replikasi"
        keterangan="Fisik ke replica, logical ke node"
      />
      {!data ? (
        <Skeleton className="m-5 h-24" />
      ) : !data.pusat.hidup ? (
        <p className="px-5 py-4 text-sm text-bahaya">Pusat tidak terjangkau, status replikasi tidak bisa dibaca.</p>
      ) : (
        <ul className="divide-y divide-line-soft px-5">
          {r.map((x) => {
            const nodeRef = x.application_name.replace("sub_ref_", "") as NodeWilayah;
            return (
              <li key={x.application_name} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="flex items-center gap-2">
                  {x.application_name === "replica" ? <Badge variant="commit">Replica</Badge> : <NodeBadge node={nodeRef} />}
                  <span className="text-ink-soft">{x.jenis.startsWith("fisik") ? "fisik" : "logical"}</span>
                </span>
                <span className={x.state === "streaming" ? "text-ink" : "text-bahaya"}>
                  {x.state === "streaming" ? "Mengalir" : x.state}
                </span>
              </li>
            );
          })}
          {r.length === 0 ? <li className="py-3 text-sm text-bahaya">Tidak ada koneksi replikasi.</li> : null}
        </ul>
      )}
    </Panel>
  );
}

function Menggantung({ data, onSelesai }: { data?: StatusCluster; onSelesai: () => void }) {
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const [semua, setSemua] = useState(true);
  const [proses, setProses] = useState(false);
  const [hasil, setHasil] = useState<{ ok: true; data: HasilPulihkan } | { ok: false; error: unknown } | null>(null);

  const daftar = data
    ? (["pusat", ...NODE_WILAYAH] as const).flatMap((n) => (data[n].prepared_xacts ?? []).map((gid) => ({ n, gid })))
    : [];

  async function pulihkan() {
    setProses(true);
    try {
      const d = await kirim<HasilPulihkan>(`/twopc/pulihkan?umur_min_detik=${semua ? 0 : 5}`);
      setHasil({ ok: true, data: d });
      toast(
        d.tindakan.length
          ? { jenis: "sukses", judul: "Pemulihan selesai", isi: `${d.tindakan.length} tindakan dijalankan.` }
          : { jenis: "info", judul: "Tidak ada yang menggantung" },
      );
      onSelesai();
      mutate((k) => typeof k === "string" && (k.startsWith("/twopc") || k.startsWith("/dashboard") || k.startsWith("/penduduk")));
    } catch (error) {
      setHasil({ ok: false, error });
      toast({ jenis: "gagal", judul: "Pemulihan gagal", isi: error instanceof Error ? error.message : undefined });
    } finally {
      setProses(false);
    }
  }

  return (
    <Panel className="mt-6">
      <PanelHeader
        judul="Transaksi yang menggantung"
        keterangan="Sudah PREPARE, belum diputuskan"
        aksi={
          <div className="flex flex-wrap items-center gap-3">
            <Centang label="Termasuk yang baru dibuat" checked={semua} onChange={(e) => setSemua(e.target.checked)} />
            <Button size="sm" onClick={pulihkan} disabled={proses}>
              {proses ? "Memulihkan..." : "Pulihkan"}
            </Button>
          </div>
        }
      />
      <div className="px-5 py-4 text-sm">
        {!data ? (
          <Skeleton className="h-5 w-64" />
        ) : daftar.length === 0 ? (
          <p className="text-ink">Tidak ada transaksi yang menggantung.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {daftar.map(({ n, gid }) => (
              <li key={`${n}-${gid}`} className="inline-flex items-center gap-2 rounded-md bg-gantung-soft px-2.5 py-1">
                <span className="font-medium text-gantung">{gid}</span>
                <span className="text-ink-soft">di {n}</span>
              </li>
            ))}
          </ul>
        )}

        {hasil && !hasil.ok ? (
          <div className="mt-4">
            <ErrorState error={hasil.error} />
          </div>
        ) : null}
        {hasil?.ok ? (
          <div className="mt-4 rounded-md border border-line-soft bg-background/60 px-4 py-3">
            <p className="text-[13px] text-ink-soft">
              Aturan: log COMMIT dituntaskan dengan COMMIT; selain itu dibatalkan (presumed abort).
            </p>
            {hasil.data.tindakan.length === 0 ? (
              <p className="mt-1 text-ink">Tidak ada yang perlu dipulihkan.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {hasil.data.tindakan.map((t) => (
                  <li key={`${t.node}-${t.gid}`} className="text-ink">
                    <span className="font-medium">{t.gid}</span> di {t.node}: log {t.status_log ?? "tidak ada"}, maka{" "}
                    <strong className={t.aksi.startsWith("COMMIT") ? "text-ink" : t.aksi.startsWith("ROLLBACK") ? "text-bahaya" : "text-gantung"}>
                      {t.aksi}
                    </strong>
                  </li>
                ))}
              </ul>
            )}
            {hasil.data.catatan ? <p className="mt-2 text-[13px] text-gantung">{hasil.data.catatan}</p> : null}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function LogKoordinator() {
  const { data, error } = useSWR<Log2PC>("/twopc/log?limit=20", { refreshInterval: 5000 });
  return (
    <Panel className="mt-6">
      <PanelHeader
        judul="Log koordinator 2PC"
        keterangan="Dasar pemulihan setelah crash"
      />
      {error && !data ? (
        <p className="px-5 py-4 text-sm text-bahaya">{error.message}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-line-soft text-left text-[13px] text-ink-soft">
              <tr>
                <th scope="col" className="px-5 py-2.5 font-medium">Waktu</th>
                <th scope="col" className="px-5 py-2.5 font-medium">Operasi</th>
                <th scope="col" className="px-5 py-2.5 font-medium">Peserta</th>
                <th scope="col" className="px-5 py-2.5 font-medium">Status</th>
                <th scope="col" className="px-5 py-2.5 font-medium">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {!data
                ? Array.from({ length: 5 }, (_, i) => (
                    <tr key={i}>
                      <td colSpan={5} className="px-5 py-2.5">
                        <Skeleton className="h-4" />
                      </td>
                    </tr>
                  ))
                : data.baris.map((b) => (
                    <tr key={b.gid}>
                      <td className="px-5 py-2.5 whitespace-nowrap text-ink-soft">{waktu(b.dibuat)}</td>
                      <td className="px-5 py-2.5 text-ink">{b.operasi.replaceAll("_", " ")}</td>
                      <td className="px-5 py-2.5">
                        <span className="flex flex-wrap gap-1">
                          {b.peserta.map((p) =>
                            p === "pusat" ? (
                              <Badge key={p} variant="commit">Pusat</Badge>
                            ) : (
                              <NodeBadge key={p} node={p as NodeWilayah} pendek />
                            ),
                          )}
                        </span>
                      </td>
                      <td className="px-5 py-2.5">
                        <StatusBadge status={b.status} />
                      </td>
                      <td className="max-w-[28rem] px-5 py-2.5 text-[13px] text-ink-soft">{b.keterangan ?? ""}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function BuktiQuery() {
  const [buka, setBuka] = useState(false);
  const { data, error } = useSWR<Explain>(buka ? "/dashboard/explain" : null);
  return (
    <details className="mt-6 rounded-xl border border-line bg-card" onToggle={(e) => setBuka(e.currentTarget.open)}>
      <summary className="cursor-pointer px-5 py-4 text-[15px] font-semibold text-ink">
        Bukti query terdistribusi (EXPLAIN)
      </summary>
      <div className="border-t border-line-soft px-5 py-4">
        {error ? (
          <ErrorState error={error} />
        ) : !data ? (
          <Skeleton className="h-40" />
        ) : (
          <>
            <p className="mb-3 max-w-prose text-[13px] text-ink">{data.cara_baca}</p>
            <pre className="overflow-x-auto rounded-xl bg-malam p-4 text-xs leading-relaxed text-white">
              {data.rencana.map((l, i) => (
                <span
                  key={i}
                  className={cn("block", /Async Foreign Scan|Relations:/.test(l) ? "font-semibold text-[#a5b4fc]" : "")}
                >
                  {l}
                </span>
              ))}
            </pre>
          </>
        )}
      </div>
    </details>
  );
}

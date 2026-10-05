import { Badge, type BadgeProps } from "@/components/ui/badge";

const PETA: Record<string, { varian: BadgeProps["variant"]; teks: string }> = {
  COMMIT: { varian: "commit", teks: "Commit" },
  SELESAI: { varian: "commit", teks: "Selesai" },
  ABORT: { varian: "bahaya", teks: "Dibatalkan" },
  "IN-DOUBT": { varian: "gantung", teks: "Menggantung" },
  "COMMIT-SEBAGIAN": { varian: "gantung", teks: "Commit sebagian" },
  "COMMIT-TERTUNDA": { varian: "gantung", teks: "Commit tertunda" },
  MULAI: { varian: "gantung", teks: "Mulai" },
  PREPARED: { varian: "gantung", teks: "Prepared" },
};

export function StatusBadge({ status }: { status: string }) {
  const p = PETA[status] ?? { varian: "netral" as const, teks: status };
  return <Badge variant={p.varian}>{p.teks}</Badge>;
}

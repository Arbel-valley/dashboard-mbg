import { NODE } from "@/lib/node";
import type { NodeWilayah } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Penanda node: titik berwarna + nama. Warna cukup di titiknya, tulisannya tetap netral. */
export function NodeBadge({ node, pendek = false }: { node: NodeWilayah | null; pendek?: boolean }) {
  if (!node) return <span className="text-ink-soft">-</span>;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-0.5 text-xs whitespace-nowrap text-ink">
      <span aria-hidden className={cn("size-1.5 rounded-full", NODE[node].bg)} />
      {pendek ? NODE[node].nama : `Node ${NODE[node].nama.toLowerCase()}`}
    </span>
  );
}

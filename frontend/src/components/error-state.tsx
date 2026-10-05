import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";

/** Menjelaskan APA yang gagal dan APA yang bisa dilakukan, bukan sekadar "terjadi kesalahan". */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const e = error instanceof ApiError ? error : null;
  const pesan = e?.message ?? (error instanceof Error ? error.message : "Permintaan gagal.");

  let saran: React.ReactNode = null;
  if (!e || e.status === 0 || typeof e.body === "string") {
    saran = (
      <>
        Pastikan cluster menyala (<code>docker compose ps</code>) dan <code>API_URL</code> di <code>.env.local</code> menunjuk
        ke port backend yang benar, lalu restart <code>npm run dev</code>.
      </>
    );
  } else if (e.status === 503) {
    saran = (
      <>
        Ada node yang tidak bisa dihubungi. Lihat{" "}
        <Link href="/cluster" className="font-medium underline">
          Status cluster
        </Link>
        .
      </>
    );
  } else if (e.status === 423) {
    saran = (
      <>
        Data sedang dikunci transaksi yang menggantung. Pulihkan dulu di{" "}
        <Link href="/cluster" className="font-medium underline">
          Status cluster
        </Link>
        .
      </>
    );
  } else if (e.status === 404 && pesan === "Not Found") {
    saran = <>Endpoint ini belum ada di backend. Pastikan backend memakai versi starter terbaru, lalu restart.</>;
  }

  return (
    <div role="alert" className="flex gap-3 rounded-xl border border-bahaya/30 bg-bahaya-soft px-5 py-4">
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-bahaya" aria-hidden />
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-bahaya">
          {pesan}
          {e && e.status > 0 ? <span className="ml-2 font-normal text-bahaya/80">HTTP {e.status}</span> : null}
        </p>
        {saran ? <p className="mt-1 text-ink [&_code]:rounded [&_code]:bg-background/60 [&_code]:px-1">{saran}</p> : null}
        {onRetry ? (
          <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
            Coba lagi
          </Button>
        ) : null}
      </div>
    </div>
  );
}

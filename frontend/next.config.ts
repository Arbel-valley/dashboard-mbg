import type { NextConfig } from "next";

// Alamat FastAPI. Browser TIDAK memanggil FastAPI secara langsung:
// request ke /api/* diteruskan (rewrite) oleh server Next.js ke alamat ini.
// Karena itu tidak ada urusan CORS, dan port backend cukup diatur di satu tempat.
// Ubah lewat .env.local (API_URL=...), lalu restart `npm run dev`.
const API_URL = (process.env.API_URL ?? "http://localhost:8000").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  // Sembunyikan indikator dev (lingkaran "N") supaya tampilan bersih saat presentasi.
  devIndicators: false,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/:path*` }];
  },
};

export default nextConfig;
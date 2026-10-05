import type { Metadata } from "next";
import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { Providers } from "@/components/providers";
import { SKRIP_AWAL } from "@/lib/tampilan";

export const metadata: Metadata = {
  title: { default: "Dasbor MBG", template: "%s | Dasbor MBG" },
  description: "Dasbor penerima Makan Bergizi Gratis dan bansos di atas basis data terdistribusi.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: class "dark" & data-sidebar dipasang skrip sebelum React jalan
    <html lang="id" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SKRIP_AWAL }} />
      </head>
      <body className="antialiased">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}

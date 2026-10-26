import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { RegisterSW } from "@/components/app/RegisterSW";
import { FontLoader } from "@/components/FontLoader";
import { SiteFooter } from "@/components/SiteFooter";
import { ToastProvider } from "@/components/ui/Toast";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "https://insidir.com"),
  title: { default: "Insidir Terminal", template: "%s | Insidir" },
  description: "Polymarket and Kalshi disagree. Insidir scans both every few seconds for prices that lock in a profit after fees, if both sides fill and both markets settle the same way.",
  icons: { icon: "/icons/favicon.svg", apple: "/icons/apple-touch-icon.png" },
  manifest: "/manifest.webmanifest",
};

/** JetBrains Mono, self-hosted (app/fonts, SIL Open Font License): preloaded, no third-party request, and a
 *  size-matched fallback so nothing shifts when it loads. */
const mono = localFont({
  src: [
    { path: "./fonts/jetbrains-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/jetbrains-mono-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "./fonts/jetbrains-mono-latin-800-normal.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-mono",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
  adjustFontFallback: false,
});

export const viewport: Viewport = { themeColor: "#000000", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={mono.variable}>
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="" />
        <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="" />
      </head>
      <body>
        <ToastProvider>
          {children}
          <SiteFooter />
        </ToastProvider>
        <RegisterSW />
        <FontLoader />
      </body>
    </html>
  );
}

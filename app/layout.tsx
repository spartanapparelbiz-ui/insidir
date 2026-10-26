import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { RegisterSW } from "@/components/app/RegisterSW";
import { SiteFooter } from "@/components/SiteFooter";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "https://insidir.com"),
  title: { default: "Insidir Terminal", template: "%s | Insidir" },
  description: "Polymarket and Kalshi disagree. Insidir scans both every few seconds for prices that lock in a profit after fees, if both sides fill and both markets settle the same way.",
  icons: { icon: "/icons/favicon.svg", apple: "/icons/apple-touch-icon.png" },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { themeColor: "#000000", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&display=swap" />
      </head>
      <body>
        {children}
        <SiteFooter />
        <RegisterSW />
      </body>
    </html>
  );
}

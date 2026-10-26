import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { FOOTER } from "@/lib/copy";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Insidir X-ray", template: "%s | Insidir" },
  description: "Paste a Polymarket link and see where proven wallets are, new-wallet buying patterns and the last 24 hours of money flow. Data only.",
};

export const viewport: Viewport = { themeColor: "#000000", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&display=swap" />
      </head>
      <body>
        <div className="wrap">
          <header className="top">
            <Link className="brand" href="/">insidir <span>x-ray</span></Link>
          </header>
          <main id="main">{children}</main>
          <footer className="foot">
            <p>{FOOTER}</p>
          </footer>
        </div>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { RegisterSW } from "@/components/app/RegisterSW";
import { SiteFooter } from "@/components/SiteFooter";
import { Beacons } from "@/components/landing/Beacons";
import { ToastProvider } from "@/components/ui/Toast";
import "./tokens.css";
import "./globals.css";
import "./v2.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "https://insidir.com"),
  title: { default: "Insidir: follow the big money", template: "%s | Insidir" },
  description: "Insidir shows you the biggest bets on sports and prediction markets the second they happen. In plain English. With alerts.",
  icons: { icon: "/icons/favicon.svg", apple: "/icons/apple-touch-icon.png" },
  manifest: "/manifest.webmanifest",
};

/** Plus Jakarta Sans for everything (docs/INSIDIR-V2.md §10), self-hosted by next/font: no third-party request at runtime. */
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["500", "700", "800"], variable: "--font-jakarta", display: "swap" });

export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body>
        <ToastProvider>
          {children}
          <SiteFooter />
        </ToastProvider>
        <RegisterSW />
        <Beacons />
      </body>
    </html>
  );
}

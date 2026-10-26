import type { Metadata, Viewport } from "next";
import { Rufina } from "next/font/google";
import localFont from "next/font/local";
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

/** Schibsted Grotesk for everything; Rufina (the closest match to the logo's wordmark) for headlines. Both self-hosted
 * by next/font: no third-party request at runtime. Schibsted is the variable font (400–900) with one change
 * (app/fonts, SIL OFL): its tabular figures apply to digits only, so "$160,000" keeps a normal comma. */
const schibsted = localFont({ src: "./fonts/schibsted-grotesk-latin.woff2", weight: "400 900", variable: "--font-schibsted", display: "swap" });
const serif = Rufina({ subsets: ["latin"], weight: ["700"], variable: "--font-rufina", display: "swap" });

export const viewport: Viewport = { themeColor: "#0b0b12", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${schibsted.variable} ${serif.variable}`}>
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

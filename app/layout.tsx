import type { Metadata, Viewport } from "next";
import { Rufina } from "next/font/google";
import localFont from "next/font/local";
import { Suspense, type ReactNode } from "react";
import { RegisterSW } from "@/components/app/RegisterSW";
import { Motion } from "@/components/motion/Motion";
import { NavProgress } from "@/components/motion/NavProgress";
import { SiteFooter } from "@/components/SiteFooter";
import { Beacons } from "@/components/landing/Beacons";
import { ToastProvider } from "@/components/ui/Toast";
import { LockProvider } from "@/components/lock/Lock";
import { unlockHref } from "@/components/app/links";
import { insidirUnlocks } from "@/components/v2/Pricing";
import { WHAT_IS, WHAT_IS_TITLE } from "@/lib/copy";
import "./tokens.css";
import "./globals.css";
import "./v2.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "https://insidir.com"),
  title: { default: WHAT_IS_TITLE, template: "%s | Insidir" },
  description: WHAT_IS,
  openGraph: { title: WHAT_IS_TITLE, description: WHAT_IS, siteName: "Insidir", type: "website" },
  twitter: { card: "summary_large_image", title: WHAT_IS_TITLE, description: WHAT_IS },
  icons: { icon: "/icons/favicon.svg", apple: "/icons/apple-touch-icon.png" },
  manifest: "/manifest.webmanifest",
  // Added to an iPhone's home screen, Insidir opens full screen like an app: what iOS needs for web push alerts.
  appleWebApp: { capable: true, title: "Insidir", statusBarStyle: "black" },
  formatDetection: { telephone: false },
};

/** Schibsted Grotesk for everything; Rufina (the closest match to the logo's wordmark) for headlines. Both self-hosted
 * by next/font: no third-party request at runtime. Schibsted is the variable font (400–900) with one change
 * (app/fonts, SIL OFL): its tabular figures apply to digits only, so "$160,000" keeps a normal comma. */
const schibsted = localFont({ src: "./fonts/schibsted-grotesk-latin.woff2", weight: "400 900", variable: "--font-schibsted", display: "swap" });
const serif = Rufina({ subsets: ["latin"], weight: ["700"], variable: "--font-rufina", display: "swap" });

export const viewport: Viewport = { themeColor: "#0b0b12", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${schibsted.variable} ${serif.variable}`} suppressHydrationWarning>
      <head>
        {/* Before first paint: lets scroll reveals start hidden only when JS will show them (components/motion/Motion.tsx). */}
        <script dangerouslySetInnerHTML={{ __html: "if(!matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.classList.add('js')" }} />
      </head>
      <body>
        <ToastProvider>
          <LockProvider unlocks={insidirUnlocks()} trialHref={unlockHref("insidir")}>
            {children}
            <SiteFooter />
          </LockProvider>
        </ToastProvider>
        <RegisterSW />
        <Motion />
        <Suspense fallback={null}><NavProgress /></Suspense>
        <Beacons />
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Suspense, type ReactNode } from "react";
import { RegisterSW } from "@/components/app/RegisterSW";
import { Motion } from "@/components/motion/Motion";
import { NavProgress } from "@/components/motion/NavProgress";
import { SiteFooter } from "@/components/SiteFooter";
import { ResearchPalette } from "@/components/research/ResearchPalette";
import { PayPrompt } from "@/components/paywall/PayPrompt";
import { cookies } from "next/headers";
import { SESSION_COOKIE, VISITOR_COOKIE } from "@/lib/auth/session";
import { JsonLd, organizationLd } from "@/lib/seo/jsonld";
import { getDb, hasDatabase } from "@/lib/db";
import { positioningEdge } from "@/lib/smart/gate";
import { Beacons } from "@/components/landing/Beacons";
import { ToastProvider } from "@/components/ui/Toast";
import { LockProvider } from "@/components/lock/Lock";
import { unlockHref } from "@/components/app/links";
import { insidirUnlocks } from "@/components/v2/Pricing";
import { WHAT_IS, WHAT_IS_TITLE } from "@/lib/copy";
import "./tokens.css";
import "./globals.css";
import "./v2.css";
import "./light.css";
import "./polish.css";
import "./laptops.css";
import "./motion.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "https://insidir.com"),
  title: { default: WHAT_IS_TITLE, template: "%s | Insidir" },
  description: WHAT_IS,
  openGraph: { title: WHAT_IS_TITLE, description: WHAT_IS, siteName: "Insidir", type: "website" },
  twitter: { card: "summary_large_image", title: WHAT_IS_TITLE, description: WHAT_IS },
  icons: { icon: "/icons/favicon.svg", apple: "/icons/apple-touch-icon.png" },
  manifest: "/manifest.webmanifest",
  // Added to an iPhone's home screen, Insidir opens full screen like an app: what iOS needs for web push alerts.
  appleWebApp: { capable: true, title: "Insidir", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

/** Schibsted Grotesk for everything, self-hosted by next/font: no third-party request at runtime. It is the variable font (400–900) with one change
 * (app/fonts, SIL OFL): its tabular figures apply to digits only, so "$160,000" keeps a normal comma. */
const schibsted = localFont({ src: "./fonts/schibsted-grotesk-latin.woff2", weight: "400 900", variable: "--font-schibsted", display: "swap" });

export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Whether Positioning has earned its place in the nav (cached for 10 minutes).
  if (hasDatabase()) await positioningEdge(getDb()).catch(() => null);
  // The timed pay prompt, for visitors only: anyone with a session (members, or signed in on their way to pay) never
  // sees it. Half the visitors (by visitor cookie) wait 6 seconds, half 12 (PAYWALL_POPUP_DELAY_MS / _B_MS).
  const jar = await cookies();
  const visitor = !jar.get(SESSION_COOKIE)?.value;
  const vid = jar.get(VISITOR_COOKIE)?.value ?? "";
  const arm = [...vid].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % 2 === 0 ? "a" : "b";
  const delay = arm === "a" ? Number(process.env.PAYWALL_POPUP_DELAY_MS ?? 6000) : Number(process.env.PAYWALL_POPUP_DELAY_B_MS ?? 12000);
  return (
    <html lang="en" className={schibsted.variable} suppressHydrationWarning>
      <head>
        {/* Every photo comes from Unsplash's image CDN (lib/unsplash.ts): open the connection before the first one is asked for. */}
        <link rel="preconnect" href="https://images.unsplash.com" />
        <link rel="dns-prefetch" href="https://images.unsplash.com" />
        {/* Before first paint: lets scroll reveals start hidden only when JS will show them (components/motion/Motion.tsx). */}
        <script dangerouslySetInnerHTML={{ __html: "if(!matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.classList.add('js')" }} />
      </head>
      <body>
        <ToastProvider>
          <LockProvider unlocks={insidirUnlocks()} trialHref={unlockHref()}>
            {children}
            <SiteFooter />
          </LockProvider>
        </ToastProvider>
        <JsonLd data={organizationLd()} />
        <RegisterSW />
        <ResearchPalette />
        {visitor ? <PayPrompt delayMs={delay} variant={`delay_${Math.round(delay / 1000)}s`} /> : null}
        <Motion />
        <Suspense fallback={null}><NavProgress /></Suspense>
        <Beacons />
      </body>
    </html>
  );
}
